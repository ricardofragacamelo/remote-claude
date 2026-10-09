/** What the commands of the PDF reader act on: the reader the person is at. */
export interface PdfReaderHandle {
  zoomIn(): void;
  zoomOut(): void;

  /** Back to the width of the reader (`Ctrl+0`, 21 · D-05). */
  zoomReset(): void;

  /** Opens the search, the field focused (B-14). */
  openFind(): void;
}

/** The readers on screen, the one reached last at the end. */
let readers: readonly PdfReaderHandle[] = [];

/**
 * The reader the focus or the pointer reached last, while it is on screen — what "Zoom in on the
 * PDF" of the palette acts on, after the palette took the focus.
 */
export function activePdfReader(): PdfReaderHandle | null {
  return readers.at(-1) ?? null;
}

/** A reader got the focus or the pointer: it is the one the commands act on now. */
export function reachPdfReader(reader: PdfReaderHandle): void {
  readers = [...readers.filter((each) => each !== reader), reader];
}

/** A reader left the screen: the commands act on the one reached before it, if any. */
export function leavePdfReader(reader: PdfReaderHandle): void {
  readers = readers.filter((each) => each !== reader);
}
