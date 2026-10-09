import { DEFAULT_SCALE } from '../lib/pdf-zoom';
import { editorStoreOf } from '../store/editor.store';
import type { PdfReaderMemory } from '../types/pdf';

/** What a reader opened for the first time starts at: page 1, fitted to the width, no panel. */
export const FRESH_READER: PdfReaderMemory = {
  page: 1,
  scale: DEFAULT_SCALE,
  sidebar: { open: false, tab: null },
};

/** What the reader of an editor tab remembers — or `null`, never opened in this page (S-27). */
export function readerMemoryOf(folder: string, tab: string): PdfReaderMemory | null {
  return editorStoreOf(folder).getState().readers[tab] ?? null;
}

/**
 * Keeps part of what the reader of an editor tab is showing — per tab, so two PDFs, or the same one
 * in two groups, each keep their own (S-26).
 */
export function rememberReader(
  folder: string,
  tab: string,
  change: Partial<PdfReaderMemory>,
): void {
  editorStoreOf(folder).setState((state) => ({
    readers: {
      ...state.readers,
      [tab]: { ...(state.readers[tab] ?? FRESH_READER), ...change },
    },
  }));
}
