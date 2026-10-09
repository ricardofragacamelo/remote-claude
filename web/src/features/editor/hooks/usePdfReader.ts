import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@/shared/logging/logger';
import { keptResult } from '../lib/pdf-find';
import { DEFAULT_SCALE, zoomedIn, zoomedOut } from '../lib/pdf-zoom';
import { leavePdfReader } from '../store/pdf-readers';
import type { PdfReaderHandle } from '../store/pdf-readers';
import type {
  PdfDestination,
  PdfDocument,
  PdfFindResult,
  PdfReaderMemory,
  PdfScale,
  PdfView,
} from '../types/pdf';
import { FRESH_READER, readerMemoryOf, rememberReader } from './pdf-memory';
import { usePdfFind } from './usePdfFind';
import type { PdfFind } from './usePdfFind';

/** How large the pages are drawn: the factor, and the fit or number that asked for it. */
export interface PdfZoom {
  readonly value: number;
  readonly scale: PdfScale;
}

/** The reader of one PDF in one editor tab, as React state. */
export interface PdfReader {
  /** The pages are laid out: moving and zooming work. */
  readonly ready: boolean;
  readonly page: number;
  readonly pageCount: number;
  readonly zoom: PdfZoom;

  /** Goes to a page, from 1. @returns `false`, staying where it is, for one the PDF does not have */
  goToPage(page: number): boolean;

  /**
   * Goes to where an outline entry leads. One the PDF does not have is told at `warn` and goes
   * nowhere (S-35). @returns whether it moved
   */
  goToDestination(dest: PdfDestination): Promise<boolean>;
  setScale(scale: PdfScale): void;
  zoomIn(): void;
  zoomOut(): void;

  /** What the commands act on — handed to the registry while the focus or the pointer is here. */
  readonly handle: PdfReaderHandle;
  readonly find: PdfFind;

  /** The side panel: open, and which tab — remembered per tab (B-10, B-11). */
  readonly sidebar: PdfReaderMemory['sidebar'];
  setSidebar(sidebar: PdfReaderMemory['sidebar']): void;
}

/** How much wheel turns one step of the zoom — a mouse notch, or a stretch of a trackpad. */
const WHEEL_STEP = 40;

/** The view of a document, laid out in the container — and the state it reports. */
function useMountedView(
  folder: string,
  tab: string,
  doc: PdfDocument,
  container: RefObject<HTMLDivElement | null>,
) {
  const { t } = useTranslation();
  const [view, setView] = useState<{ readonly doc: PdfDocument; readonly view: PdfView } | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<PdfZoom>({ value: 1, scale: DEFAULT_SCALE });
  const [found, setFound] = useState<PdfFindResult | null>(null);
  // What the last search was for — a result for another is dropped (S-48).
  const searched = useRef('');
  const label = useRef(t);

  useLayoutEffect(() => {
    label.current = t;
  });

  useEffect(() => {
    // The container is on screen by the time an effect runs: it is drawn with the reader, always.
    const target = container.current as HTMLDivElement;
    const memory = readerMemoryOf(folder, tab) ?? FRESH_READER;
    const mounted = doc.mount(target, {
      pageLabel: (number) => label.current('editor.pdf.pageLabel', { page: number }),
      onReady: () => {
        mounted.setScale(memory.scale);
        // A page that is gone — the file changed on disk — falls back to the last one (S-28).
        mounted.goToPage(Math.min(Math.max(memory.page, 1), doc.pageCount));
        setView({ doc, view: mounted });
      },
      onPage: (number) => {
        setPage(number);
        rememberReader(folder, tab, { page: number });
      },
      onScale: (value, scale) => {
        setZoom({ value, scale });
        rememberReader(folder, tab, { scale });
      },
      onFind: (result) => {
        setFound((kept) => keptResult(searched.current, kept, result));
      },
    });
    logger.debug({ op: 'editor.pdf.mount', pages: doc.pageCount }, 'pdf reader mounted');

    return () => {
      mounted.destroy();
    };
  }, [folder, tab, doc, container]);

  const searchedFor = useCallback((query: string) => {
    searched.current = query;
  }, []);

  return { view: view?.doc === doc ? view.view : null, page, zoom, found, searchedFor };
}

/** Ctrl and the wheel zoom the reader — not the page of the browser (S-14). */
function useWheelZoom(
  container: RefObject<HTMLDivElement | null>,
  zoomIn: () => void,
  zoomOut: () => void,
): void {
  useEffect(() => {
    const target = container.current as HTMLDivElement;
    let turned = 0;

    const wheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      turned += event.deltaY;

      if (Math.abs(turned) >= WHEEL_STEP) {
        if (turned < 0) zoomIn();
        else zoomOut();
        turned = 0;
      }
    };

    target.addEventListener('wheel', wheel, { passive: false });
    return () => {
      target.removeEventListener('wheel', wheel);
    };
  }, [container, zoomIn, zoomOut]);
}

/** Home and End go to the first and the last page, with the focus in the pages (S-11). */
function useEdgeKeys(
  container: RefObject<HTMLDivElement | null>,
  goTo: RefObject<(page: number) => boolean>,
  pageCount: number,
): void {
  useEffect(() => {
    const target = container.current as HTMLDivElement;

    const press = (event: KeyboardEvent): void => {
      const page = event.key === 'Home' ? 1 : event.key === 'End' ? pageCount : null;

      if (page !== null && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        goTo.current(page);
      }
    };

    target.addEventListener('keydown', press);
    return () => {
      target.removeEventListener('keydown', press);
    };
  }, [container, goTo, pageCount]);
}

/**
 * The reader of a PDF in an editor tab (21 · F1): every page in one scroll, laid out by pdf.js in
 * the container; the page and the zoom as state; and what it showed, remembered per tab while the
 * page is open (21 · D-06) — put back when the tab comes back, or the file is opened again.
 */
export function usePdfReader(
  folder: string,
  tab: string,
  doc: PdfDocument,
): {
  /** Where the pages go — an absolutely positioned `<div>` with a `<div>` inside. */
  readonly container: RefObject<HTMLDivElement | null>;
  readonly reader: PdfReader;
} {
  const container = useRef<HTMLDivElement>(null);
  const { view, page, zoom, found, searchedFor } = useMountedView(folder, tab, doc, container);
  const find = usePdfFind(view, searchedFor, found);
  const [sidebar, setSidebarState] = useState(
    () => (readerMemoryOf(folder, tab) ?? FRESH_READER).sidebar,
  );
  const value = zoom.value;

  const setScale = useCallback((scale: PdfScale) => view?.setScale(scale), [view]);
  const zoomIn = useCallback(() => {
    const next = zoomedIn(value);
    if (next !== null) setScale(next);
  }, [setScale, value]);
  const zoomOut = useCallback(() => {
    const next = zoomedOut(value);
    if (next !== null) setScale(next);
  }, [setScale, value]);

  useWheelZoom(container, zoomIn, zoomOut);

  const latest = useRef({ zoomIn, zoomOut, setScale, show: find.show });

  useLayoutEffect(() => {
    latest.current = { zoomIn, zoomOut, setScale, show: find.show };
  });
  const handle = useMemo<PdfReaderHandle>(
    () => ({
      zoomIn: () => latest.current.zoomIn(),
      zoomOut: () => latest.current.zoomOut(),
      zoomReset: () => latest.current.setScale(DEFAULT_SCALE),
      openFind: () => latest.current.show(),
    }),
    [],
  );

  useEffect(
    () => () => {
      leavePdfReader(handle);
    },
    [handle],
  );

  const goToPage = useCallback(
    (number: number) => {
      if (view === null || !Number.isInteger(number) || number < 1 || number > doc.pageCount) {
        return false;
      }
      view.goToPage(number);
      return true;
    },
    [view, doc],
  );
  const goTo = useRef(goToPage);

  useLayoutEffect(() => {
    goTo.current = goToPage;
  });
  useEdgeKeys(container, goTo, doc.pageCount);

  return {
    container,
    reader: {
      ready: view !== null,
      page,
      pageCount: doc.pageCount,
      zoom,
      goToPage,
      goToDestination: async (dest) => {
        const moved = view !== null && (await view.goToDestination(dest));
        if (!moved) {
          logger.warn({ op: 'editor.pdf.destination' }, 'pdf destination not found');
        }
        return moved;
      },
      setScale,
      zoomIn,
      zoomOut,
      handle,
      find,
      sidebar,
      setSidebar: (next) => {
        setSidebarState(next);
        rememberReader(folder, tab, { sidebar: next });
      },
    },
  };
}
