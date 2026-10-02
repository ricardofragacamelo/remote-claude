import { useInfiniteQuery } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';

/** What a paged read needs to know: where it lives in the cache, how to fetch, how to go on. */
export interface PagedQueryOptions<P> {
  readonly queryKey: readonly unknown[];

  /** One page, after the cursor the previous one handed out — or the first, for `null`. */
  fetchPage(cursor: string | null): Promise<P>;

  /** The cursor of the page after this one, or `null` on the last. */
  nextCursor(page: P): string | null;

  /** A list asks again when the tab comes back; a detail does not. */
  readonly refetchOnWindowFocus: boolean;

  /**
   * Asks again on its own every so many milliseconds while it is on screen — a list that follows
   * the world (plan 08, D-10). Absent, it never polls.
   */
  readonly refetchIntervalMs?: number;

  /** How long a page stays good; the thirty seconds of every stable server datum when absent. */
  readonly staleTimeMs?: number;
}

/** The four states of the first page, and the way to the next ones. */
export interface PagedQuery<P> {
  /** Every page so far, in the order they were read. `undefined` until the first arrives. */
  readonly pages: readonly P[] | undefined;

  readonly isLoading: boolean;

  /** Why the first page failed. Nothing else is on screen then — there is nothing true to show. */
  readonly error: AppError | null;

  readonly hasMore: boolean;
  readonly isLoadingMore: boolean;

  /** Why the last "load more" failed. What is already on screen stays. */
  readonly moreError: AppError | null;

  loadMore(): void;
  reload(): void;
}

/** How long a page stays good: the thirty seconds every stable server datum here gets. */
const STALE_AFTER_MS = 30_000;

/**
 * A server read by cursor, a page at a time, held in the query cache.
 *
 * Written once because every paged screen of the history does the same five things — cache by
 * key, ask for the next page by the cursor the last one handed out, tell the first page's failure
 * from a later one's, refuse a second "more" while one is in flight, and retry — and the copy that
 * is not written every day is the one that forgets the guard. Server data lives in the cache, never
 * in component state (docs/architecture/web/04-state-and-data.md).
 */
export function usePagedQuery<P>(options: PagedQueryOptions<P>): PagedQuery<P> {
  const query = useInfiniteQuery<
    P,
    AppError,
    InfiniteData<P, string | null>,
    readonly unknown[],
    string | null
  >({
    queryKey: options.queryKey,
    queryFn: ({ pageParam }) => options.fetchPage(pageParam),
    initialPageParam: null,
    getNextPageParam: (page) => options.nextCursor(page),
    staleTime: options.staleTimeMs ?? STALE_AFTER_MS,
    refetchOnWindowFocus: options.refetchOnWindowFocus,
    refetchInterval: options.refetchIntervalMs ?? false,
  });

  const pages = query.data?.pages;
  const hasPages = pages !== undefined && pages.length > 0;

  return {
    pages,
    isLoading: query.isPending,
    error: hasPages ? null : query.error,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    moreError: hasPages && query.isFetchNextPageError ? query.error : null,
    loadMore: () => {
      // A second click while the first is in flight asks nothing more.
      if (!query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    },
    reload: () => {
      void query.refetch();
    },
  };
}
