import { skipToken, useQuery } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { locateFiles } from '../services/search.service';
import type { LocateEntry, LocateQuery, SearchTruncation } from '../types/search';
import { searchKeys } from './search-keys';

/** The locator, as a screen reads it: the four states, and nothing stale from another folder. */
export interface FileFinder {
  readonly entries: readonly LocateEntry[];
  readonly truncated: SearchTruncation;
  readonly isLoading: boolean;
  readonly error: AppError | null;
}

/**
 * The locator behind Quick Open (B-14) and the `@` of the composer (plan 08, B-25) — one hook,
 * two consumers. A query superseded by the next keystroke is cancelled through the `AbortSignal`
 * TanStack Query hands the service, never just ignored (S-62's own budget depends on it).
 *
 * @param folder the tab's own folder, or `null` while there is none to search
 * @param request `null` while there is nothing to ask — Quick Open with an empty palette still
 *   asks once, for `prefer`, so `null` is for "not open" rather than "no query typed"
 */
export function useFileFinder(folder: string | null, request: LocateQuery | null): FileFinder {
  const enabled = folder !== null && request !== null;
  const query = useQuery<
    { entries: readonly LocateEntry[]; truncated: SearchTruncation },
    AppError
  >({
    queryKey: enabled ? searchKeys.locate(folder, request) : [...searchKeys.all, 'locate'],
    queryFn: enabled ? ({ signal }) => locateFiles(folder, request, signal) : skipToken,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  return {
    entries: query.data?.entries ?? [],
    truncated: query.data?.truncated ?? null,
    isLoading: enabled && query.isPending,
    error: query.error,
  };
}
