import { afterEach, describe, expect, it, vi } from 'vitest';

const pdfjs = vi.hoisted(() => {
  const render = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
  const page = { getViewport: vi.fn(() => ({ width: 100.7, height: 200.2 })), render };
  const proxy = {
    numPages: 4,
    getPage: vi.fn(() => Promise.resolve(page)),
    getOutline: vi.fn((): Promise<unknown[] | null> => Promise.resolve(null)),
  };
  const task: {
    promise: Promise<unknown>;
    destroy: ReturnType<typeof vi.fn>;
    onPassword?: (answer: (password: string) => void, reason: number) => void;
  } = { promise: Promise.resolve(proxy), destroy: vi.fn(() => Promise.resolve()) };
  return {
    page,
    render,
    proxy,
    task,
    getDocument: vi.fn(() => task),
    GlobalWorkerOptions: { workerSrc: '' },
  };
});

vi.mock('pdfjs-dist', () => ({
  getDocument: pdfjs.getDocument,
  GlobalWorkerOptions: pdfjs.GlobalWorkerOptions,
  PasswordResponses: { NEED_PASSWORD: 1, INCORRECT_PASSWORD: 2 },
}));

const viewer = vi.hoisted(() => ({ mountViewer: vi.fn(() => ({ the: 'view' })) }));

vi.mock('@/features/editor/lib/pdfjs-viewer', () => viewer);

import { loadPdfEngine, setPdfLoader } from '@/features/editor/lib/pdf-loader';
import { createPdfjsEngine } from '@/features/editor/lib/pdfjs-engine';
import { AppError } from '@/shared/api/errors';
import type { PdfDocument, PdfPasswordPrompt } from '@/features/editor/types/pdf';

/** Nobody is asked a password: these documents have none. */
const NO_PASSWORD: PdfPasswordPrompt = () => Promise.resolve(null);

/** Opens bytes and takes the document — the tests that do not lock it. */
async function opened(data = new Uint8Array([1])): Promise<PdfDocument> {
  return (await createPdfjsEngine().open(data, NO_PASSWORD)) as PdfDocument;
}

afterEach(() => {
  setPdfLoader();
});

describe('the pdf.js of our build — plan 07, S-311', () => {
  it('serves its worker from the build, never a CDN, and opens bytes with XFA off', async () => {
    const engine = createPdfjsEngine();
    const data = new Uint8Array([1, 2, 3]);

    expect(pdfjs.GlobalWorkerOptions.workerSrc).toMatch(/pdf\.worker\.min\.mjs/);
    expect(pdfjs.GlobalWorkerOptions.workerSrc).not.toMatch(/^https?:/);

    const doc = (await engine.open(data, NO_PASSWORD)) as PdfDocument;
    expect(pdfjs.getDocument).toHaveBeenCalledWith({ data, enableXfa: false });
    expect(doc.pageCount).toBe(4);

    const canvas = document.createElement('canvas');
    await doc.renderPage(2, canvas, 1.5, new AbortController().signal);
    expect(pdfjs.proxy.getPage).toHaveBeenCalledWith(2);
    expect(pdfjs.page.getViewport).toHaveBeenCalledWith({ scale: 1.5 });
    expect([canvas.width, canvas.height]).toEqual([100, 200]);
    expect(pdfjs.render).toHaveBeenCalledWith({
      canvas,
      viewport: { width: 100.7, height: 200.2 },
    });

    doc.destroy();
    expect(pdfjs.task.destroy).toHaveBeenCalled();
  });

  it('draws nothing for a page given up on while it was fetched', async () => {
    pdfjs.render.mockClear();
    const doc = await opened();
    const drawing = new AbortController();
    const canvas = document.createElement('canvas');

    const drawn = doc.renderPage(1, canvas, 1, drawing.signal);
    drawing.abort();

    await expect(drawn).resolves.toBeUndefined();
    expect(pdfjs.render).not.toHaveBeenCalled();
    expect([canvas.width, canvas.height]).toEqual([300, 150]);
  });

  it('cancels a drawing given up on, which frees the canvas and is no failure', async () => {
    const cancel = vi.fn();
    let fail: (error: Error) => void = () => undefined;
    const promise = new Promise<void>((_resolve, reject) => {
      fail = reject;
    });
    cancel.mockImplementation(() => {
      fail(new Error('Rendering cancelled, page 1'));
    });
    pdfjs.render.mockReturnValueOnce({ promise, cancel });
    const doc = await opened();
    const drawing = new AbortController();

    const drawn = doc.renderPage(1, document.createElement('canvas'), 1, drawing.signal);
    await vi.waitFor(() => {
      expect(pdfjs.render).toHaveBeenCalled();
    });
    drawing.abort();
    drawing.abort();

    await expect(drawn).resolves.toBeUndefined();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('passes on a drawing that failed on its own, and cancels nothing after it', async () => {
    const cancel = vi.fn();
    pdfjs.render.mockReturnValueOnce({
      promise: Promise.reject(new Error('bad page')),
      cancel,
    });
    const doc = await opened();
    const drawing = new AbortController();

    await expect(
      doc.renderPage(1, document.createElement('canvas'), 1, drawing.signal),
    ).rejects.toThrow('bad page');
    drawing.abort();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('is loaded on demand and once, by the default loader', async () => {
    const first = loadPdfEngine();
    expect(loadPdfEngine()).toBe(first);
    await expect(first).resolves.toHaveProperty('open');
  });

  it('forgets a load that failed, so trying again tries again', async () => {
    const engine = { open: vi.fn() };
    const loader = vi.fn().mockRejectedValueOnce(new Error('chunk')).mockResolvedValueOnce(engine);
    setPdfLoader(loader);

    const failure = await loadPdfEngine().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AppError);
    expect((failure as AppError).messageKey).toBe('editor.preview.pdfLoadFailed');
    await expect(loadPdfEngine()).resolves.toBe(engine);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe('the reader and the password of pdf.js — plan 21, B-05, B-09', () => {
  it('reads the outline as the port says it, and empty for a PDF without one', async () => {
    const doc = await opened();
    await expect(doc.outline()).resolves.toEqual([]);

    pdfjs.proxy.getOutline.mockResolvedValueOnce([
      {
        title: 'Part one',
        dest: 'part1',
        items: [{ title: 'Chapter', dest: [{ num: 1, gen: 0 }], items: [] }],
      },
      { title: 'Heading only', dest: null, items: [] },
      { title: 'No dest at all', items: [] },
    ]);
    await expect(doc.outline()).resolves.toEqual([
      {
        title: 'Part one',
        dest: 'part1',
        items: [{ title: 'Chapter', dest: [{ num: 1, gen: 0 }], items: [] }],
      },
      { title: 'Heading only', dest: null, items: [] },
      { title: 'No dest at all', dest: null, items: [] },
    ]);
  });

  it('lays the reader out through the viewer adapter', async () => {
    const doc = await opened();
    const container = document.createElement('div');
    const host = {
      pageLabel: vi.fn(),
      onReady: vi.fn(),
      onPage: vi.fn(),
      onScale: vi.fn(),
      onFind: vi.fn(),
    };

    expect(doc.mount(container, host)).toEqual({ the: 'view' });
    expect(viewer.mountViewer).toHaveBeenCalledWith(pdfjs.proxy, container, host);
  });

  it('asks the password pdf.js asks for, and hands the answer straight back (S-21, S-22)', async () => {
    let open: (value: unknown) => void = () => undefined;
    pdfjs.task.promise = new Promise((resolve) => {
      open = resolve;
    });
    const asked: string[] = [];
    const answered: string[] = [];
    const prompt: PdfPasswordPrompt = (reason) => {
      asked.push(reason);
      return Promise.resolve(reason === 'needed' ? 'wrong' : 'right');
    };

    const opening = createPdfjsEngine().open(new Uint8Array([1]), prompt);
    const onPassword = pdfjs.task.onPassword as NonNullable<typeof pdfjs.task.onPassword>;
    onPassword((password) => answered.push(password), 1);
    onPassword((password) => answered.push(password), 2);
    await vi.waitFor(() => {
      expect(answered).toEqual(['wrong', 'right']);
    });
    open(pdfjs.proxy);

    await expect(opening).resolves.toHaveProperty('pageCount', 4);
    expect(asked).toEqual(['needed', 'incorrect']);
    pdfjs.task.promise = Promise.resolve(pdfjs.proxy);
  });

  it('lets go of the task when the person gives up — or the question fails — and says locked (S-23)', async () => {
    for (const prompt of [
      (() => Promise.resolve(null)) as PdfPasswordPrompt,
      (() => Promise.reject(new Error('closed'))) as PdfPasswordPrompt,
    ]) {
      let fail: (error: Error) => void = () => undefined;
      pdfjs.task.promise = new Promise((_resolve, reject) => {
        fail = reject;
      });
      pdfjs.task.destroy.mockClear();
      pdfjs.task.destroy.mockImplementation(() => {
        fail(new Error('Loading aborted'));
        return Promise.resolve();
      });

      const opening = createPdfjsEngine().open(new Uint8Array([1]), prompt);
      pdfjs.task.onPassword?.(() => undefined, 1);

      await expect(opening).resolves.toBe('locked');
      expect(pdfjs.task.destroy).toHaveBeenCalledTimes(1);
    }
    pdfjs.task.destroy.mockImplementation(() => Promise.resolve());
    pdfjs.task.promise = Promise.resolve(pdfjs.proxy);
  });

  it('still says a corrupt file is one, when no password was asked', async () => {
    pdfjs.task.promise = Promise.reject(new Error('Invalid PDF structure'));

    await expect(createPdfjsEngine().open(new Uint8Array([1]), NO_PASSWORD)).rejects.toThrow(
      'Invalid PDF structure',
    );
    pdfjs.task.promise = Promise.resolve(pdfjs.proxy);
  });
});
