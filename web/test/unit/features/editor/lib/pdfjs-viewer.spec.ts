import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const viewer = vi.hoisted(() => {
  type Listener = (event: unknown) => void;

  class EventBus {
    readonly listeners = new Map<string, Set<Listener>>();
    readonly dispatched: [string, unknown][] = [];
    on(name: string, listener: Listener): void {
      const set = this.listeners.get(name) ?? new Set<Listener>();
      set.add(listener);
      this.listeners.set(name, set);
    }
    off(name: string, listener: Listener): void {
      this.listeners.get(name)?.delete(listener);
    }
    dispatch(name: string, data: unknown): void {
      this.dispatched.push([name, data]);
      for (const listener of this.listeners.get(name) ?? []) listener(data);
    }
  }

  class PDFLinkService {
    readonly options: unknown;
    readonly setViewer = vi.fn();
    readonly setDocument = vi.fn();
    readonly goToDestination = vi.fn(() => Promise.resolve());
    constructor(options: unknown) {
      this.options = options;
    }
    addLinkAttributes(): void {
      throw new Error('the product rule replaces this');
    }
  }

  class PDFFindController {
    readonly options: unknown;
    readonly setDocument = vi.fn();
    constructor(options: unknown) {
      this.options = options;
    }
  }

  const made: PDFViewer[] = [];
  class PDFViewer {
    readonly options: Record<string, unknown>;
    readonly setDocument = vi.fn();
    currentPageNumber = 1;
    currentScaleValue = 'auto';
    constructor(options: Record<string, unknown>) {
      this.options = options;
      made.push(this);
    }
  }

  return { EventBus, PDFLinkService, PDFFindController, PDFViewer, made };
});

vi.mock('pdfjs-dist/web/pdf_viewer.mjs', () => ({
  EventBus: viewer.EventBus,
  LinkTarget: { NONE: 0, SELF: 1, BLANK: 2 },
  PDFFindController: viewer.PDFFindController,
  PDFLinkService: viewer.PDFLinkService,
  PDFViewer: viewer.PDFViewer,
}));
vi.mock('pdfjs-dist/web/pdf_viewer.css', () => ({}));
vi.mock('pdfjs-dist', () => ({ AnnotationMode: { DISABLE: 0, ENABLE: 1, ENABLE_FORMS: 2 } }));

import { mountViewer, pageOfDestination } from '@/features/editor/lib/pdfjs-viewer';
import type { PdfFindResult, PdfScale } from '@/features/editor/types/pdf';

type Made = InstanceType<typeof viewer.PDFViewer>;

/** A document of pdf.js with three pages and the destinations a test names. */
function aProxy(dests: Record<string, unknown[] | null> = {}): PDFDocumentProxy {
  return {
    numPages: 3,
    getDestination: vi.fn((name: string) =>
      name === 'explodes' ? Promise.reject(new Error('bad')) : Promise.resolve(dests[name] ?? null),
    ),
    getPageIndex: vi.fn((ref: { num: number }) =>
      ref.num === 99 ? Promise.reject(new Error('no page')) : Promise.resolve(ref.num),
    ),
  } as unknown as PDFDocumentProxy;
}

function aHost() {
  return {
    pageLabel: vi.fn((page: number) => `Page ${String(page)}`),
    onReady: vi.fn<() => void>(),
    onPage: vi.fn<(page: number) => void>(),
    onScale: vi.fn<(value: number, scale: PdfScale) => void>(),
    onFind: vi.fn<(result: PdfFindResult) => void>(),
  };
}

/** A container with the pages pdf.js would have laid out in it. */
function aContainer(pages = 2): HTMLDivElement {
  const container = document.createElement('div');
  const inner = document.createElement('div');
  for (let page = 1; page <= pages; page += 1) {
    const div = document.createElement('div');
    div.className = 'page';
    div.dataset['pageNumber'] = String(page);
    inner.append(div);
  }
  container.append(inner);
  return container;
}

function mounted(proxy = aProxy()) {
  const host = aHost();
  const container = aContainer();
  const view = mountViewer(proxy, container, host);
  const made = viewer.made.at(-1) as Made;
  const options = made.options as {
    eventBus: InstanceType<typeof viewer.EventBus>;
    linkService: InstanceType<typeof viewer.PDFLinkService> & {
      addLinkAttributes(link: HTMLAnchorElement, url: string): void;
    };
    findController: InstanceType<typeof viewer.PDFFindController>;
  };
  return { host, container, view, made, ...options, proxy };
}

afterEach(() => {
  viewer.made.length = 0;
});

describe('the reader of pdf.js behind the port — plan 21, B-05', () => {
  it('lays the reader out with its bus, links and search; no forms, no scripts, no autolinks (S-06, S-20)', () => {
    const { made, eventBus, linkService, findController, proxy, view } = mounted();

    expect(made.options).toMatchObject({
      annotationMode: 1,
      enableAutoLinking: false,
    });
    expect(made.options).not.toHaveProperty('scriptingManager');
    expect(linkService).toBeInstanceOf(viewer.PDFLinkService);
    expect(linkService.options).toMatchObject({
      eventBus,
      externalLinkTarget: 2,
      externalLinkRel: 'noopener noreferrer nofollow',
    });
    expect(findController.options).toMatchObject({ eventBus, linkService });
    expect(linkService.setViewer).toHaveBeenCalledWith(made);
    expect(made.setDocument).toHaveBeenCalledWith(proxy);
    expect(linkService.setDocument).toHaveBeenCalledWith(proxy);
    expect(findController.setDocument).toHaveBeenCalledWith(proxy);

    view.destroy();
    expect(made.setDocument).toHaveBeenLastCalledWith(null);
    expect(linkService.setDocument).toHaveBeenLastCalledWith(null);
    expect(findController.setDocument).toHaveBeenLastCalledWith(null);
  });

  it('turns the events of pdf.js into the callbacks of the port, and none after destroy (S-07)', () => {
    const { host, container, eventBus, view } = mounted();

    eventBus.dispatch('pagesinit', {});
    expect(host.onReady).toHaveBeenCalledTimes(1);
    expect(
      [...container.querySelectorAll('.page')].map((page) => page.getAttribute('aria-label')),
    ).toEqual(['Page 1', 'Page 2']);

    eventBus.dispatch('pagechanging', { pageNumber: 3 });
    eventBus.dispatch('scalechanging', { scale: 1.37, presetValue: 'page-width' });
    eventBus.dispatch('scalechanging', { scale: 0.8, presetValue: 'page-fit' });
    eventBus.dispatch('scalechanging', { scale: 1.1, presetValue: 'auto' });
    eventBus.dispatch('scalechanging', { scale: 2 });
    eventBus.dispatch('scalechanging', { scale: 0.5, presetValue: 'page-actual' });
    expect(host.onPage).toHaveBeenCalledWith(3);
    expect(host.onScale.mock.calls).toEqual([
      [1.37, 'page-width'],
      [0.8, 'page-fit'],
      [1.1, 'auto'],
      [2, 2],
      [0.5, 0.5],
    ]);

    view.destroy();
    eventBus.dispatch('pagechanging', { pageNumber: 1 });
    eventBus.dispatch('pagesinit', {});
    expect(host.onPage).toHaveBeenCalledTimes(1);
    expect(host.onReady).toHaveBeenCalledTimes(1);
  });

  it('translates nothing of its own: the app names the pages, in its language', async () => {
    const { made } = mounted();
    const l10n = made.options['l10n'] as {
      getLanguage(): string;
      getDirection(): string;
      get(ids: unknown, args: unknown, fallback?: string): Promise<string>;
      translate(element: unknown): Promise<void>;
      translateOnce(element: unknown): Promise<void>;
      destroy(): Promise<void>;
      pause(): void;
      resume(): void;
    };
    document.documentElement.lang = 'pt-BR';

    expect([l10n.getLanguage(), l10n.getDirection()]).toEqual(['pt-BR', 'ltr']);
    await expect(l10n.get('pdfjs-x', null, 'fallback')).resolves.toBe('fallback');
    await expect(l10n.get('pdfjs-x', null)).resolves.toBe('');
    await expect(l10n.translate(document.body)).resolves.toBeUndefined();
    await expect(l10n.translateOnce(document.body)).resolves.toBeUndefined();
    await expect(l10n.destroy()).resolves.toBeUndefined();
    expect([l10n.pause(), l10n.resume()]).toEqual([undefined, undefined]);
    document.documentElement.lang = 'en';
  });

  it('moves and zooms through the viewer', () => {
    const { made, view } = mounted();

    view.goToPage(2);
    expect(made.currentPageNumber).toBe(2);
    view.setScale(1.5);
    expect(made.currentScaleValue).toBe('1.5');
    view.setScale('page-fit');
    expect(made.currentScaleValue).toBe('page-fit');
  });

  it('opens http, https and mailto in a new tab with the rel of a text; nothing else is a link (S-19)', () => {
    const { linkService } = mounted();
    const linked = (url: string): HTMLAnchorElement => {
      const link = document.createElement('a');
      link.href = 'https://left.over/';
      link.target = '_self';
      linkService.addLinkAttributes(link, url);
      return link;
    };

    for (const url of ['http://example.com/a', 'https://example.com/b', 'mailto:a@example.com']) {
      const link = linked(url);
      expect(link.getAttribute('href')).toBe(url);
      expect(link.target).toBe('_blank');
      expect(link.rel).toBe('noopener noreferrer nofollow');
      expect(link.title).toBe(url);
    }
    for (const url of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'ftp://example.com/x',
      'tel:+5551999999999',
      'data:text/html,<script>1</script>',
    ]) {
      const link = linked(url);
      expect(link.hasAttribute('href')).toBe(false);
      expect(link.hasAttribute('target')).toBe(false);
    }
  });

  it('goes to a destination the document has, and says false for one it does not (S-35)', async () => {
    const ref = { num: 1, gen: 0 };
    const { view, linkService } = mounted(
      aProxy({ chapter: [ref, { name: 'XYZ' }], nowhere: [{ num: 99, gen: 0 }] }),
    );

    await expect(view.goToDestination('chapter')).resolves.toBe(true);
    expect(linkService.goToDestination).toHaveBeenCalledWith('chapter');
    await expect(view.goToDestination([2, { name: 'Fit' }])).resolves.toBe(true);
    expect(linkService.goToDestination).toHaveBeenLastCalledWith([2, { name: 'Fit' }]);

    linkService.goToDestination.mockClear();
    for (const dest of ['missing', 'nowhere', 'explodes', [7], ['x'], [] as unknown[]]) {
      await expect(view.goToDestination(dest)).resolves.toBe(false);
    }
    expect(linkService.goToDestination).not.toHaveBeenCalled();

    view.destroy();
    await expect(view.goToDestination('chapter')).resolves.toBe(false);
  });

  it('finds through the bus, says each result with the search it answers, and closes (S-46, S-48)', () => {
    const { view, eventBus, host } = mounted();
    const search = {
      query: 'light',
      caseSensitive: true,
      entireWord: true,
      previous: false,
      again: false,
    };

    view.find(search);
    expect(eventBus.dispatched.at(-1)).toEqual([
      'find',
      {
        source: null,
        type: '',
        query: 'light',
        caseSensitive: true,
        entireWord: true,
        highlightAll: true,
        findPrevious: false,
        matchDiacritics: false,
      },
    ]);
    view.find({ ...search, again: true, previous: true });
    expect(eventBus.dispatched.at(-1)?.[1]).toMatchObject({ type: 'again', findPrevious: true });

    eventBus.dispatch('updatefindcontrolstate', {
      state: 3,
      matchesCount: { current: 0, total: 2 },
    });
    eventBus.dispatch('updatefindmatchescount', { matchesCount: { current: 2, total: 4 } });
    eventBus.dispatch('updatefindcontrolstate', { state: 0 });
    expect(host.onFind.mock.calls).toEqual([
      [{ query: 'light', current: 0, total: 2, pending: true }],
      [{ query: 'light', current: 2, total: 4, pending: false }],
      [{ query: 'light', current: 0, total: 0, pending: false }],
    ]);

    view.closeFind();
    expect(eventBus.dispatched.at(-1)).toEqual(['findbarclose', { source: null }]);
    eventBus.dispatch('updatefindmatchescount', { matchesCount: { current: 1, total: 1 } });
    expect(host.onFind).toHaveBeenLastCalledWith({
      query: '',
      current: 1,
      total: 1,
      pending: false,
    });
  });

  it('reads a destination of an integer page, and refuses one past the document', async () => {
    const proxy = aProxy();

    await expect(pageOfDestination(proxy, [0])).resolves.toBe(1);
    await expect(pageOfDestination(proxy, [3])).resolves.toBeNull();
    await expect(pageOfDestination(proxy, [-1])).resolves.toBeNull();
  });
});
