import { useCallback, useEffect, useRef, useState } from 'react';

import type { AppError } from '@/shared/api/errors';

/** One page of a query, once it answered — tagged with the query it answers. */
type Page<T> = { readonly query: string } & (
  | { readonly status: 'failed'; readonly error: AppError }
  | { readonly status: 'ready'; readonly items: readonly T[]; readonly nextCursor: string | null }
);

/** Where "load more" is, for one query. */
interface More {
  readonly query: string;
  readonly isLoading: boolean;
  readonly error: AppError | null;
}

/** What a screen reading a cursor-paged list needs: the four states of the first page, and the way to the next ones. */
export interface PagedList<T> {
  readonly isLoading: boolean;
  readonly error: AppError | null;
  readonly items: readonly T[];

  /** Whether there is a page after the ones on screen. */
  readonly hasMore: boolean;

  readonly isLoadingMore: boolean;

  /** Why the last "load more" failed. The items already on screen stay. */
  readonly moreError: AppError | null;

  loadMore(): void;
  reload(): void;

  /**
   * Replaces the items on screen, from an answer already in hand — never a network call, and
   * never applied to a query that has since been replaced: a screen patching a row it already
   * knows changed does not need to ask the server again, and must not patch a page that is not
   * this query's own.
   */
  setItems(updater: (current: readonly T[]) => readonly T[]): void;
}

/**
 * One cursor-paged query, a page at a time — the trail and the rules screens both read like this,
 * and the three decisions below are the same for either one, about somebody reading a list while
 * it grows:
 *
 * - **a new query starts again from the top**, and whatever was still arriving for the old one is
 *   dropped — a page of the previous query appended under the new one would put on screen items
 *   the query says are not there;
 * - **a failed "load more" keeps what is on screen**, with the reason beside the button. The items
 *   already read are still true; replacing them with an error would hide them;
 * - **a second click on "load more" asks nothing** while the first is in flight. The guard is a
 *   ref and not state: two clicks inside one frame both read it from before either settles.
 *
 * @param key the query, as one stable string — a new string is a new query from the top; a new
 *   object holding the same string is not
 * @param fetchPage reads one page, from `null` (the first) or the cursor the previous page gave.
 *   Has to be **stable** across renders for the same `key` — memoised by the caller, closing over
 *   whatever `key` itself was built from
 */
export function usePagedList<T>(
  key: string,
  fetchPage: (cursor: string | null) => Promise<{ items: readonly T[]; nextCursor: string | null }>,
): PagedList<T> {
  const [attempt, setAttempt] = useState(0);
  const query = `${key}#${String(attempt)}`;
  const [page, setPage] = useState<Page<T> | null>(null);
  const [more, setMore] = useState<More | null>(null);

  // The query the answers now arriving are for. Anything answering another one lands nowhere.
  const latest = useRef(query);
  const moreInFlight = useRef<string | null>(null);

  useEffect(() => {
    latest.current = query;

    void fetchPage(null)
      .then((result) => {
        if (latest.current === query) {
          setPage({ query, status: 'ready', items: result.items, nextCursor: result.nextCursor });
        }
      })
      .catch((error: AppError) => {
        if (latest.current === query) {
          setPage({ query, status: 'failed', error });
        }
      });
    // `fetchPage` is not a dependency on purpose: it is keyed by `key` already, and a caller that
    // rebuilds it every render (an inline closure instead of a memoised one) must not restart the
    // query on that account alone — `key` already says when the query itself changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `fetchPage` is keyed by `key` already; a caller that rebuilds it every render must not restart the query on that account alone
  }, [key, query]);

  const current = ofQuery(page, query);
  const currentMore = ofQuery(more, query);

  const loadMore = useCallback(() => {
    if (current?.status !== 'ready' || current.nextCursor === null) {
      return;
    }

    if (moreInFlight.current === query) {
      return;
    }

    moreInFlight.current = query;
    setMore({ query, isLoading: true, error: null });

    void fetchPage(current.nextCursor)
      .then((result) => {
        if (latest.current !== query) {
          return;
        }

        setPage((previous) =>
          previous?.query === query && previous.status === 'ready'
            ? {
                ...previous,
                items: [...previous.items, ...result.items],
                nextCursor: result.nextCursor,
              }
            : previous,
        );
        setMore({ query, isLoading: false, error: null });
      })
      .catch((error: AppError) => {
        if (latest.current === query) {
          setMore({ query, isLoading: false, error });
        }
      })
      .finally(() => {
        if (moreInFlight.current === query) {
          moreInFlight.current = null;
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `fetchPage` is keyed by `key`/`query` already; it is not a dependency on its own
  }, [current, query]);

  const reload = useCallback(() => {
    setAttempt((previous) => previous + 1);
  }, []);

  const setItems = useCallback(
    (updater: (current: readonly T[]) => readonly T[]) => {
      setPage((previous) =>
        previous?.query === query && previous.status === 'ready'
          ? { ...previous, items: updater(previous.items) }
          : previous,
      );
    },
    [query],
  );

  return {
    ...firstPageOf(current),
    isLoadingMore: currentMore?.isLoading ?? false,
    moreError: currentMore?.error ?? null,
    loadMore,
    reload,
    setItems,
  };
}

/** The state, when it belongs to this query; `null` when it answers another one. */
function ofQuery<T extends { readonly query: string }>(state: T | null, query: string): T | null {
  return state?.query === query ? state : null;
}

/** The four states of the first page, as the screen reads them. */
function firstPageOf<T>(
  current: Page<T> | null,
): Pick<PagedList<T>, 'isLoading' | 'error' | 'items' | 'hasMore'> {
  if (current === null) {
    return { isLoading: true, error: null, items: [], hasMore: false };
  }

  if (current.status === 'failed') {
    return { isLoading: false, error: current.error, items: [], hasMore: false };
  }

  return {
    isLoading: false,
    error: null,
    items: current.items,
    hasMore: current.nextCursor !== null,
  };
}
