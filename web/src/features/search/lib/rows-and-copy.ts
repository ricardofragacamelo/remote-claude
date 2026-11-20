import { copyAllTextOf, resultCountOf, searchRowsOf } from './search-rows';
import type { MatchedFile, SearchRow } from './search-rows';
import type { SearchMatch } from '../types/search';

/** The dismissal and the folding a search or a replace view's tree both read the same way. */
export interface RowsState {
  readonly collapsed: ReadonlySet<string>;
  readonly dismissed: ReadonlySet<string>;
  readonly stale: ReadonlySet<string>;
}

/** `files` flattened into rows, and their live match count — the search's own, or the replace preview's. */
export function rowsOf<M extends SearchMatch>(
  files: readonly MatchedFile<M>[],
  state: RowsState,
): { readonly rows: readonly SearchRow<M>[]; readonly resultCount: number } {
  const rows = searchRowsOf(files, state.collapsed, state.dismissed, state.stale);
  return { rows, resultCount: resultCountOf(rows) };
}

/** Every result of `files`, as "Copy All" writes it — a collapsed file's matches copy too (S-118). */
export function copyAllOf<M extends SearchMatch>(
  files: readonly MatchedFile<M>[],
  state: Pick<RowsState, 'dismissed' | 'stale'>,
): string {
  return copyAllTextOf(searchRowsOf(files, new Set(), state.dismissed, state.stale));
}
