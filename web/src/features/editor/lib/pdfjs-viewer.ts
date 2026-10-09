import { AnnotationMode } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  EventBus,
  LinkTarget,
  PDFFindController,
  PDFLinkService,
  PDFViewer,
} from 'pdfjs-dist/web/pdf_viewer.mjs';
import 'pdfjs-dist/web/pdf_viewer.css';

import { kindOfUrl } from '@/shared/components/markdown/safe-url';
import type { PdfDestination, PdfFindResult, PdfView, PdfViewHost } from '../types/pdf';

/** What `updatefindcontrolstate` and `updatefindmatchescount` carry, as far as the reader reads it. */
interface FindEvent {
  readonly state?: number;
  readonly matchesCount?: { readonly current: number; readonly total: number };
  readonly rawQuery?: string | null;
}

/** What the viewer is told to translate with. */
type ViewerL10n = NonNullable<ConstructorParameters<typeof PDFViewer>[0]['l10n']>;

/**
 * A localisation that translates nothing. pdf.js's own speaks English only, and would write its
 * words over the app's: the names of the pages are given by the app, in its language.
 */
const SILENT_L10N = {
  getLanguage: () => document.documentElement.lang,
  getDirection: () => 'ltr',
  get: (_ids: unknown, _args: unknown, fallback?: string) => Promise.resolve(fallback ?? ''),
  translate: () => Promise.resolve(),
  translateOnce: () => Promise.resolve(),
  destroy: () => Promise.resolve(),
  pause: () => undefined,
  resume: () => undefined,
} as unknown as ViewerL10n;

/** The state of pdf.js's find controller while it is still reading pages. */
const FIND_PENDING = 3;

/**
 * The rel of every link that leaves the reader — the one of the `Markdown` (web/03).
 */
const EXTERNAL_REL = 'noopener noreferrer nofollow';

/**
 * The links pdf.js writes, through the rule of the product (21 · D-08): `http`, `https` and `mailto`
 * open in a new tab, with the rel of every link of a text; anything else — `javascript:`, `file:`,
 * `ftp:`, `tel:`, `data:` — keeps its words and loses its `href`. The same `kindOfUrl` the
 * `Markdown` uses: one rule, not two.
 */
class ProductLinkService extends PDFLinkService {
  override addLinkAttributes(link: HTMLAnchorElement, url: string): void {
    const kind = kindOfUrl(url);

    if (kind !== 'web' && kind !== 'mail') {
      link.removeAttribute('href');
      link.removeAttribute('target');
      return;
    }

    link.href = url;
    link.target = '_blank';
    link.rel = EXTERNAL_REL;
    // The link lies over the text of the page, with none inside it: where it goes is its name, and
    // its tooltip says it before the click.
    link.title = url;
  }
}

/** Whether a value is a reference to an object of the PDF — what an explicit destination starts with. */
function isRef(value: unknown): value is { num: number; gen: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { num?: unknown }).num === 'number' &&
    typeof (value as { gen?: unknown }).gen === 'number'
  );
}

/**
 * The page a destination leads to, from 1 — `null` for one the document does not have: a name it
 * does not define, a reference to no page, a shape pdf.js would refuse.
 */
export async function pageOfDestination(
  proxy: PDFDocumentProxy,
  dest: PdfDestination,
): Promise<number | null> {
  try {
    const explicit = typeof dest === 'string' ? await proxy.getDestination(dest) : dest;
    const target: unknown = Array.isArray(explicit) ? explicit[0] : undefined;
    const index = isRef(target)
      ? await proxy.getPageIndex(target)
      : Number.isInteger(target)
        ? (target as number)
        : null;

    return index !== null && index >= 0 && index < proxy.numPages ? index + 1 : null;
  } catch {
    return null;
  }
}

/** The result of a search, from what pdf.js says — the text it answers for comes with it. */
function findResultOf(event: FindEvent, query: string): PdfFindResult {
  return {
    query,
    current: event.matchesCount?.current ?? 0,
    total: event.matchesCount?.total ?? 0,
    pending: event.state === FIND_PENDING,
  };
}

/**
 * Lays a document of pdf.js out in `container` as a reader (21 · B-05): the `PDFViewer` of the
 * package, with its event bus, its link service and its find controller — text layer on, the
 * annotations drawn without forms (`AnnotationMode.ENABLE`), no scripting manager, so no script of
 * the PDF ever runs. pdf.js's own CSS comes with this module, which only a dynamic import reaches.
 *
 * `container` has to be absolutely positioned, with a `<div>` inside it for the pages.
 */
export function mountViewer(
  proxy: PDFDocumentProxy,
  container: HTMLDivElement,
  host: PdfViewHost,
): PdfView {
  const eventBus = new EventBus();
  const linkService = new ProductLinkService({
    eventBus,
    externalLinkTarget: LinkTarget.BLANK,
    externalLinkRel: EXTERNAL_REL,
  });
  const findController = new PDFFindController({ eventBus, linkService });
  const viewer = new PDFViewer({
    container,
    eventBus,
    linkService,
    findController,
    annotationMode: AnnotationMode.ENABLE,
    enableAutoLinking: false,
    removePageBorders: false,
    l10n: SILENT_L10N,
  });
  let live = true;
  let query = '';
  const listeners: [string, (event: never) => void][] = [
    [
      'pagesinit',
      () => {
        for (const page of container.querySelectorAll<HTMLElement>('.page[data-page-number]')) {
          page.setAttribute('aria-label', host.pageLabel(Number(page.dataset['pageNumber'])));
        }
        host.onReady();
      },
    ],
    ['pagechanging', (event: { pageNumber: number }) => host.onPage(event.pageNumber)],
    [
      'scalechanging',
      (event: { scale: number; presetValue?: string }) =>
        host.onScale(
          event.scale,
          event.presetValue === 'page-width' ||
            event.presetValue === 'page-fit' ||
            event.presetValue === 'auto'
            ? event.presetValue
            : event.scale,
        ),
    ],
    ['updatefindcontrolstate', (event: FindEvent) => host.onFind(findResultOf(event, query))],
    ['updatefindmatchescount', (event: FindEvent) => host.onFind(findResultOf(event, query))],
  ];
  const guarded = listeners.map(([name, listener]) => {
    const once = (event: never): void => {
      if (live) {
        listener(event);
      }
    };
    eventBus.on(name, once);
    return [name, once] as const;
  });

  linkService.setViewer(viewer);
  linkService.setDocument(proxy);
  findController.setDocument(proxy);
  viewer.setDocument(proxy);

  return {
    goToPage: (page) => {
      viewer.currentPageNumber = page;
    },
    goToDestination: async (dest) => {
      const page = await pageOfDestination(proxy, dest);

      if (page === null || !live) {
        return false;
      }

      await linkService.goToDestination(typeof dest === 'string' ? dest : [...dest]);
      return true;
    },
    setScale: (scale) => {
      viewer.currentScaleValue = String(scale);
    },
    find: (search) => {
      query = search.query;
      eventBus.dispatch('find', {
        source: null,
        type: search.again ? 'again' : '',
        query: search.query,
        caseSensitive: search.caseSensitive,
        entireWord: search.entireWord,
        highlightAll: true,
        findPrevious: search.previous,
        matchDiacritics: false,
      });
    },
    closeFind: () => {
      query = '';
      eventBus.dispatch('findbarclose', { source: null });
    },
    destroy: () => {
      live = false;
      for (const [name, listener] of guarded) {
        eventBus.off(name, listener);
      }
      findController.setDocument(null as unknown as PDFDocumentProxy);
      viewer.setDocument(null as unknown as PDFDocumentProxy);
      linkService.setDocument(null);
    },
  };
}
