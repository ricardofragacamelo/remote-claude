/**
 * The port the PDF preview draws through (B-50) — pdf.js behind it in the app, a fake in jsdom,
 * where pdf.js cannot draw: the same split as the editor's `CodeEditor` port (07 · D-09).
 */
export interface PdfDocument {
  /** How many pages it has. */
  readonly pageCount: number;

  /** Draws a page, from 1, on a canvas — at `scale` times its size. */
  renderPage(page: number, canvas: HTMLCanvasElement, scale: number): Promise<void>;

  /** Lets go of the document: its worker's memory, its pages. */
  destroy(): void;
}

/** What opens a PDF's bytes. */
export interface PdfEngine {
  /**
   * @throws {Error} for bytes that are not a PDF it can read — a corrupt file
   */
  open(data: Uint8Array): Promise<PdfDocument>;
}
