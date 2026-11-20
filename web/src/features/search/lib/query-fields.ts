import { useSearchPreferences } from '../store/search-preferences.store';
import type { SearchViewState } from '../store/search-view.store';
import type { SearchQuery } from '../types/search';

/** The flags and filters a search or a replace request both start from — the store's own. */
export type QueryFields = Pick<
  SearchViewState,
  'query' | 'isRegex' | 'caseSensitive' | 'wholeWord' | 'include' | 'exclude' | 'useIgnoreFiles'
>;

/** `include`/`exclude`, typed as a comma list — the request wants an array, or none at all. */
export function globsOf(field: string): readonly string[] | undefined {
  const globs = field
    .split(',')
    .map((glob) => glob.trim())
    .filter((glob) => glob !== '');

  return globs.length === 0 ? undefined : globs;
}

/**
 * Whether the request goes case-sensitive: the toggle itself, or "caixa inteligente" (B-19) turning
 * it on by itself the moment the query has an upper-case letter — it only ever turns case
 * sensitivity **on**, never off what the toggle already asked for.
 */
function caseSensitiveOf(query: string, caseSensitive: boolean): boolean {
  return (
    caseSensitive || (useSearchPreferences.getState().preferences.smartCase && /[A-Z]/.test(query))
  );
}

/**
 * The fields a text search and a replace preview both ask with (plan 11, B-10/B-11) — what each
 * adds beyond this (`onlyPaths` for the search, `replacement`/`preserveCase` for the replace) is
 * its own.
 */
export function baseQueryOf(
  state: QueryFields,
): Pick<SearchQuery, 'pattern' | 'isRegex' | 'caseSensitive' | 'wholeWord' | 'useIgnoreFiles'> &
  Pick<SearchQuery, 'include' | 'exclude'> {
  const include = globsOf(state.include);
  const exclude = globsOf(state.exclude);

  return {
    pattern: state.query,
    isRegex: state.isRegex,
    caseSensitive: caseSensitiveOf(state.query, state.caseSensitive),
    wholeWord: state.wholeWord,
    useIgnoreFiles: state.useIgnoreFiles,
    ...(include === undefined ? {} : { include }),
    ...(exclude === undefined ? {} : { exclude }),
  };
}
