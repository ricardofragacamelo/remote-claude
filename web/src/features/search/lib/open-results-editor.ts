import { createFile, openFile } from '@/features/editor';
import { logger } from '@/shared/logging/logger';
import { CODE_SEARCH_EXTENSION } from './code-search-format';
import { resultsEditorContentOf } from './results-editor-content';
import type { ResultsEditorFlags } from './results-editor-content';
import type { SearchRow } from './search-rows';

/** A fresh, unused name at the folder's own root — one call never collides with another. */
function resultsEditorPathOf(): string {
  return `search-results-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}${CODE_SEARCH_EXTENSION}`;
}

/**
 * "Open in editor" (plan 11, B-17): the on-screen results, written as a real `.code-search` file
 * at the folder's own root and opened as a tab — a write of the 07, on the person's own track,
 * like any other (D-08). Never the disk of a file the search found, only this new one.
 */
export async function openResultsEditor(
  folder: string,
  flags: ResultsEditorFlags,
  rows: readonly SearchRow[],
): Promise<void> {
  const path = resultsEditorPathOf();
  const content = resultsEditorContentOf(flags, rows);

  await createFile({
    folder,
    path,
    content,
    encoding: 'utf-8',
    bom: false,
    confirmSensitive: false,
  });
  openFile(folder, path);

  logger.debug({ op: 'search.openResultsEditor', folder, path }, 'results opened as a file');
}
