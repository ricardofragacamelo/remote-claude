/**
 * The ports the PDF preview works through (B-50, plan 21) — pdf.js behind them in the app, a fake in
 * jsdom, where pdf.js cannot draw: the same split as the editor's `CodeEditor` port (07 · D-09).
 */

/**
 * How large the pages are drawn: a number (1 is the size the PDF says), or one of the fits of
 * pdf.js — the width of the reader, a whole page in it, or the reader's own choice (21 · D-05, D-09).
 */
export type PdfScale = number | 'page-width' | 'page-fit' | 'auto';

/** Where a link or an entry of the outline leads: a named destination, or an explicit one. */
export type PdfDestination = string | readonly unknown[];

/** An entry of a PDF's outline, and the entries under it. */
export interface PdfOutlineItem {
  readonly title: string;

  /** `null` for an entry that leads nowhere — a heading only. */
  readonly dest: PdfDestination | null;
  readonly items: readonly PdfOutlineItem[];
}

/** A search of the text of the PDF (B-14). */
export interface PdfFindQuery {
  readonly query: string;
  readonly caseSensitive: boolean;
  readonly entireWord: boolean;

  /** Towards the previous match — Shift+Enter. */
  readonly previous: boolean;

  /** The same search again — the next (or previous) match, not a new search. */
  readonly again: boolean;
}

/** How a search went: the match on screen and how many there are, from 1 — `0 of 0` is none. */
export interface PdfFindResult {
  /** The text it answers for — an answer to a search already replaced is not shown (S-48). */
  readonly query: string;
  readonly current: number;
  readonly total: number;

  /** Still reading pages: the count may grow. */
  readonly pending: boolean;
}

/**
 * What a mounted reader tells — always after it happened, never after `destroy` — and the words it
 * asks for.
 */
export interface PdfViewHost {
  /** The accessible name of a page of the reader — translated by the app, not by pdf.js. */
  pageLabel(page: number): string;

  /** The pages are laid out: the reader can be moved and zoomed. */
  onReady(): void;

  /** The page most on screen changed. From 1. */
  onPage(page: number): void;

  /** The pages were drawn at another size: the factor, and the fit or number that asked for it. */
  onScale(value: number, scale: PdfScale): void;
  onFind(result: PdfFindResult): void;
}

/** The reader of one document in a container: every page in one scroll (B-05). */
export interface PdfView {
  goToPage(page: number): void;

  /**
   * Moves to where an outline entry or a link leads.
   *
   * @returns `false`, having moved nowhere, for a destination the document does not have (S-35)
   */
  goToDestination(dest: PdfDestination): Promise<boolean>;
  setScale(scale: PdfScale): void;
  find(query: PdfFindQuery): void;

  /** Stops searching and takes the highlight away. */
  closeFind(): void;

  /** Lets go of the reader: its pages leave the container, and no event arrives any more. */
  destroy(): void;
}

export interface PdfDocument {
  /** How many pages it has. */
  readonly pageCount: number;

  /**
   * Draws a page, from 1, on a canvas — at `scale` times its size. Aborting `signal` gives the
   * drawing up and frees the canvas for the next one; a drawing given up on resolves, it is no
   * failure.
   */
  renderPage(
    page: number,
    canvas: HTMLCanvasElement,
    scale: number,
    signal: AbortSignal,
  ): Promise<void>;

  /** The outline of the document — empty when it has none. */
  outline(): Promise<readonly PdfOutlineItem[]>;

  /**
   * Lays the document out in `container`, as a reader — text that selects, links that follow the
   * rule of the product, no script and no form of the PDF.
   */
  mount(container: HTMLDivElement, host: PdfViewHost): PdfView;

  /** Lets go of the document: its worker's memory, its pages. */
  destroy(): void;
}

/** Why the password is asked: the first time, or after a wrong one. */
export type PdfPasswordReason = 'needed' | 'incorrect';

/**
 * Asks the person for the password of a PDF. It resolves to what was typed — or to `null`, when the
 * person gave up. The password goes from here to the engine and nowhere else (21 · D-07).
 */
export type PdfPasswordPrompt = (reason: PdfPasswordReason) => Promise<string | null>;

/** What opens a PDF's bytes. */
export interface PdfEngine {
  /**
   * @returns the document — or `'locked'`, when it has a password and the person gave up on it
   * @throws {Error} for bytes that are not a PDF it can read — a corrupt file
   */
  open(data: Uint8Array, password: PdfPasswordPrompt): Promise<PdfDocument | 'locked'>;
}

/** The tabs of the side panel of the reader (B-11). */
export type PdfSidebarTab = 'outline' | 'thumbnails';

/**
 * What the reader of one editor tab remembers while the page is open (21 · D-06): where it was, how
 * large, and its side panel. In memory only — a reload starts over (S-27).
 */
export interface PdfReaderMemory {
  readonly page: number;
  readonly scale: PdfScale;
  readonly sidebar: { readonly open: boolean; readonly tab: PdfSidebarTab | null };
}
