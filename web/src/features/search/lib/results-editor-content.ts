import { serializeCodeSearch } from './code-search-format';
import type { CodeSearchHeader } from './code-search-format';
import type { SearchRow } from './search-rows';
import { useSearchPreferences } from '../store/search-preferences.store';
import type { SearchFileResult, SearchMatch } from '../types/search';

/** What the live Search view carries that a fresh `.code-search` header starts from. */
export type ResultsEditorFlags = Pick<
  CodeSearchHeader,
  'query' | 'isRegex' | 'caseSensitive' | 'wholeWord' | 'include' | 'exclude' | 'useIgnoreFiles'
>;

/** `rows` (B-15's tree, dismissal already applied), grouped back into one result per file. */
function filesOf(rows: readonly SearchRow[]): readonly SearchFileResult[] {
  const files: SearchFileResult[] = [];
  let matches: SearchMatch[] = [];

  for (const row of rows) {
    if (row.kind === 'file') {
      matches = [];
      files.push({ path: row.path, matches, contextLines: [] });
    } else {
      matches.push(row.match);
    }
  }

  return files;
}

/**
 * What "Open in editor" (plan 11, B-17) writes as a fresh `.code-search` tab — exactly the rows on
 * screen, a dismissed file or match left out the same way the tree already leaves it out.
 */
export function resultsEditorContentOf(
  flags: ResultsEditorFlags,
  rows: readonly SearchRow[],
): string {
  const header: CodeSearchHeader = {
    ...flags,
    contextLines: useSearchPreferences.getState().preferences.resultsEditorContextLines,
  };

  return serializeCodeSearch(header, filesOf(rows));
}
