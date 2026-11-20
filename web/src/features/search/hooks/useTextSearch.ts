import { skipToken, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, QueryFunction, QueryKey } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { searchText } from '../services/search.service';
import type { SearchFileResult, SearchQuery, TextSearchState } from '../types/search';
import { searchKeys } from './search-keys';
import { runStream, useStream } from './stream-query';

/** The text search, as the view reads it — still arriving, or settled, with what arrived kept either way. */
export interface TextSearch extends TextSearchState {
  readonly isSearching: boolean;
  readonly error: AppError | null;
  reload(): void;
}

/** The query key and the runner for one ask — `skipToken` for "nothing to search yet" (B-13). */
function textSearchQueryOf(
  folder: string | null,
  request: SearchQuery | null,
  client: QueryClient,
): { readonly key: QueryKey; readonly queryFn: QueryFunction<TextSearchState> | typeof skipToken } {
  if (folder === null || request === null) {
    return { key: [...searchKeys.all, 'text'], queryFn: skipToken };
  }

  const key = searchKeys.text(folder, request);
  return {
    key,
    queryFn: ({ signal }) => runStream(searchText(folder, request, signal), key, client),
  };
}

/**
 * A text search (plan 11, B-10), streamed into the screen one file at a time. Typing again
 * cancels whatever was still running through the `AbortSignal` TanStack Query hands the runner —
 * never just ignored, the same budget `useFileFinder` already spends on this (S-62's sibling for
 * the search view, B-15).
 *
 * @param folder the tab's own folder, or `null` while there is none to search
 * @param request `null` while there is no query to run yet (an empty pattern is refused by the
 *   domain, so callers hold off rather than let every keystroke round-trip a 400)
 */
export function useTextSearch(folder: string | null, request: SearchQuery | null): TextSearch {
  const client = useQueryClient();
  const { key, queryFn } = textSearchQueryOf(folder, request, client);
  const { isFetching, ...state } = useStream<SearchFileResult>(
    key,
    queryFn,
    folder !== null && request !== null,
  );

  return { ...state, isSearching: isFetching };
}
