import type {
  PdfDestination,
  PdfDocument,
  PdfEngine,
  PdfFindQuery,
  PdfOutlineItem,
  PdfScale,
  PdfView,
  PdfViewHost,
} from '@/features/editor/types/pdf';

/** What a fit draws at, in the fake — a factor no step is, as pdf.js's fits rarely are. */
export const FAKE_FITS: Readonly<Record<Exclude<PdfScale, number>, number>> = {
  'page-width': 1.3,
  'page-fit': 0.8,
  auto: 1.1,
};

/** A reader the fake laid out, as the test drives and reads it. */
export interface FakeView {
  readonly page: number;
  readonly scale: PdfScale;
  readonly searches: readonly PdfFindQuery[];
  readonly closedFind: number;
  readonly destroyed: boolean;

  /** The person scrolled to a page: pdf.js says the page changed. */
  scrollTo(page: number): void;

  /** pdf.js drew at another size — a fit it computed, a factor no step is. */
  setScale(scale: PdfScale): void;
}

export interface FakePdfOptions {
  /** The text of each page — or how many pages, each saying its number. */
  readonly pages: readonly string[] | number;
  readonly outline?: readonly PdfOutlineItem[];

  /** The names of the destinations it defines, to the page each leads to. */
  readonly dests?: Readonly<Record<string, number>>;

  /** It has one: opening asks for it. */
  readonly password?: string;

  /** What drawing a page (a thumbnail) fails with, for these pages. */
  readonly failing?: readonly number[];

  /** Opening it fails — bytes that are not a PDF. */
  readonly corrupt?: boolean;
}

/** The fake engine, and what it saw. */
export interface FakePdf {
  readonly engine: PdfEngine;
  readonly views: readonly FakeView[];

  /** The passwords it was given, in order — what a test proves never went anywhere else. */
  readonly tried: readonly string[];
  readonly drawn: readonly number[];
  readonly givenUp: readonly number[];
  destroyed(): number;

  /** Ends every drawing still running — thumbnails wait for it. */
  finishDrawings(): void;
  drawing(): readonly number[];

  /** Drawings end as soon as they start. */
  drawAtOnce(): void;
}

/** Where a destination leads, in the fake: a name it defines, or `[page]`. */
function pageOf(
  dest: PdfDestination,
  dests: Readonly<Record<string, number>>,
  count: number,
): number | null {
  const page = typeof dest === 'string' ? dests[dest] : dest[0];
  return typeof page === 'number' && page >= 1 && page <= count ? page : null;
}

/** The matches of a search in the text of the pages, in order: `[page, index]`. */
function matchesOf(texts: readonly string[], query: PdfFindQuery): number {
  if (query.query === '') {
    return 0;
  }
  const flags = query.caseSensitive ? 'g' : 'gi';
  const escaped = query.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(query.entireWord ? `\\b${escaped}\\b` : escaped, flags);
  return texts.reduce((total, text) => total + (text.match(pattern)?.length ?? 0), 0);
}

/** One reader of the fake, laid out in the container as pages of text. */
function fakeViewOf(
  texts: readonly string[],
  options: FakePdfOptions,
  container: HTMLDivElement,
  host: PdfViewHost,
): PdfView & FakeView {
  const holder = container.firstElementChild ?? container;
  let page = 1;
  let scale: PdfScale = 'auto';
  let current = 0;
  let live = true;
  const searches: PdfFindQuery[] = [];
  let closedFind = 0;

  texts.forEach((text, index) => {
    const div = document.createElement('div');
    div.className = 'page';
    div.dataset['pageNumber'] = String(index + 1);
    div.setAttribute('role', 'region');
    div.setAttribute('aria-label', host.pageLabel(index + 1));
    div.textContent = text;
    holder.append(div);
  });

  const move = (to: number): void => {
    if (live && to !== page) {
      page = to;
      host.onPage(to);
    }
  };

  queueMicrotask(() => {
    if (live) host.onReady();
  });

  return {
    get page() {
      return page;
    },
    get scale() {
      return scale;
    },
    get searches() {
      return searches;
    },
    get closedFind() {
      return closedFind;
    },
    get destroyed() {
      return !live;
    },
    scrollTo: move,
    goToPage: move,
    goToDestination: (dest) => {
      const to = pageOf(dest, options.dests ?? {}, texts.length);
      if (to !== null) move(to);
      return Promise.resolve(to !== null);
    },
    setScale: (next) => {
      scale = next;
      if (live) host.onScale(typeof next === 'number' ? next : FAKE_FITS[next], next);
    },
    find: (query) => {
      searches.push(query);
      const total = matchesOf(texts, query);
      const step = query.previous ? -1 : 1;
      current = total === 0 ? 0 : query.again ? ((current - 1 + step + total) % total) + 1 : 1;
      const result = { query: query.query, current, total, pending: false };
      queueMicrotask(() => {
        if (live) host.onFind(result);
      });
    },
    closeFind: () => {
      closedFind += 1;
    },
    destroy: () => {
      live = false;
      holder.replaceChildren();
    },
  };
}

/**
 * A PDF engine for jsdom, where pdf.js cannot lay anything out (21 · R-04): the same port, its pages
 * as text in the container, the fits as fixed factors, the search counted over the text — and a
 * password, when it has one. Drawings of a page wait until the test ends them, so a test can catch
 * one in the middle; and it keeps the rule of pdf.js — one drawing on a canvas at a time.
 */
export function aFakePdf(options: FakePdfOptions): FakePdf {
  const texts =
    typeof options.pages === 'number'
      ? Array.from({ length: options.pages }, (_, index) => `Page text ${String(index + 1)}`)
      : options.pages;
  const views: FakeView[] = [];
  const tried: string[] = [];
  const drawn: number[] = [];
  const givenUp: number[] = [];
  const pending = new Map<number, () => void>();
  const inUse = new WeakSet<HTMLCanvasElement>();
  let atOnce = false;
  let destroyed = 0;

  const doc: PdfDocument = {
    pageCount: texts.length,
    renderPage: (page, canvas, _scale, signal) => {
      if (inUse.has(canvas)) {
        return Promise.reject(new Error('Cannot use the same canvas during multiple render()'));
      }
      if (options.failing?.includes(page) === true) {
        return Promise.reject(new Error(`page ${String(page)} is broken`));
      }
      inUse.add(canvas);
      return new Promise<void>((resolve) => {
        const done = (): void => {
          inUse.delete(canvas);
          pending.delete(page);
          resolve();
        };
        signal.addEventListener('abort', () => {
          givenUp.push(page);
          done();
        });
        if (atOnce) {
          drawn.push(page);
          done();
        } else {
          pending.set(page, () => {
            drawn.push(page);
            done();
          });
        }
      });
    },
    outline: () => Promise.resolve(options.outline ?? []),
    mount: (container, host) => {
      const view = fakeViewOf(texts, options, container, host);
      views.push(view);
      return view;
    },
    destroy: () => {
      destroyed += 1;
    },
  };

  const open: PdfEngine['open'] = async (_data, password) => {
    if (options.corrupt === true) {
      throw new Error('Invalid PDF structure');
    }
    let reason: 'needed' | 'incorrect' = 'needed';
    while (options.password !== undefined) {
      const typed = await password(reason);
      if (typed === null) {
        return 'locked';
      }
      tried.push(typed);
      if (typed === options.password) {
        break;
      }
      reason = 'incorrect';
    }
    return doc;
  };

  return {
    engine: { open },
    views,
    tried,
    drawn,
    givenUp,
    destroyed: () => destroyed,
    finishDrawings: () => {
      for (const finish of [...pending.values()]) {
        finish();
      }
    },
    drawing: () => [...pending.keys()],
    drawAtOnce: () => {
      atOnce = true;
      for (const finish of [...pending.values()]) {
        finish();
      }
    },
  };
}
