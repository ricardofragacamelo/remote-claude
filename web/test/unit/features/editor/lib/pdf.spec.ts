import { afterEach, describe, expect, it, vi } from 'vitest';

const pdfjs = vi.hoisted(() => {
  const render = vi.fn(() => ({ promise: Promise.resolve() }));
  const page = { getViewport: vi.fn(() => ({ width: 100.7, height: 200.2 })), render };
  const proxy = { numPages: 4, getPage: vi.fn(() => Promise.resolve(page)) };
  const task = { promise: Promise.resolve(proxy), destroy: vi.fn(() => Promise.resolve()) };
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
}));

import { loadPdfEngine, setPdfLoader } from '@/features/editor/lib/pdf-loader';
import { createPdfjsEngine } from '@/features/editor/lib/pdfjs-engine';
import { AppError } from '@/shared/api/errors';

afterEach(() => {
  setPdfLoader();
});

describe('the pdf.js of our build — plan 07, S-311', () => {
  it('serves its worker from the build, never a CDN, and opens bytes with XFA off', async () => {
    const engine = createPdfjsEngine();
    const data = new Uint8Array([1, 2, 3]);

    expect(pdfjs.GlobalWorkerOptions.workerSrc).toMatch(/pdf\.worker\.min\.mjs/);
    expect(pdfjs.GlobalWorkerOptions.workerSrc).not.toMatch(/^https?:/);

    const doc = await engine.open(data);
    expect(pdfjs.getDocument).toHaveBeenCalledWith({ data, enableXfa: false });
    expect(doc.pageCount).toBe(4);

    const canvas = document.createElement('canvas');
    await doc.renderPage(2, canvas, 1.5);
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
