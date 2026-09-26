import { useCallback, useEffect, useRef, useState } from 'react';

import type { AppError } from '@/shared/api/errors';
import { fetchAuditPage } from '../services/audit.service';
import type { AuditEntry, AuditFilters } from '../types/audit';

/**
 * The first page of one query, once it answered — tagged with the query it answers.
 *
 * The tag is what makes a new filter read as "loading" without anything being reset: a state that
 * belongs to another query is simply not this query's state.
 */
type Trail = { readonly query: string } & (
  | { readonly status: 'failed'; readonly error: AppError }
  | {
      readonly status: 'ready';
      readonly entries: readonly AuditEntry[];
      readonly nextCursor: string | null;
    }
);

/** Where "load more" is, for one query. */
interface More {
  readonly query: string;
  readonly isLoading: boolean;
  readonly error: AppError | null;
}

/** What the screen gets: the four states of the first page, and the way to the next ones. */
export interface AuditTrail {
  readonly isLoading: boolean;
  readonly error: AppError | null;
  readonly entries: readonly AuditEntry[];

  /** Whether there is a page after the ones on screen. */
  readonly hasMore: boolean;

  readonly isLoadingMore: boolean;

  /** Why the last "load more" failed. The entries already on screen stay (S-77). */
  readonly moreError: AppError | null;

  loadMore(): void;
  reload(): void;
}

/**
 * The filters as one stable string, so a new object with the same filters is not a new query.
 *
 * The field order is fixed: the key is what the effect depends on, and two keys for one filter
 * would be a reload nobody asked for.
 */
export function auditFiltersKey(filters: AuditFilters): string {
  const { sessionId, toolName, decision, from, to } = filters;

  return JSON.stringify({ sessionId, toolName, decision, from, to });
}

/**
 * The trail, a page at a time.
 *
 * Three decisions here are about somebody reading while the trail grows:
 *
 * - **a new filter starts again from the top**, and whatever was still arriving for the old one is
 *   dropped (S-78). A page of the previous filter appended under the new one would put on screen
 *   entries the filter says are not there;
 * - **a failed "load more" keeps what is on screen**, with the reason beside the button (S-77).
 *   The entries already read are still true; replacing them with an error would hide them;
 * - **a second click on "load more" asks nothing** while the first is in flight (S-80). The guard
 *   is a ref and not state: two clicks inside one frame both read the state from before either.
 */
export function useAuditTrail(filters: AuditFilters): AuditTrail {
  const key = auditFiltersKey(filters);
  const [attempt, setAttempt] = useState(0);
  const query = `${key}#${String(attempt)}`;
  const [trail, setTrail] = useState<Trail | null>(null);
  const [more, setMore] = useState<More | null>(null);

  // The query the answers now arriving are for. Anything answering another one lands nowhere.
  const latest = useRef(query);
  const moreInFlight = useRef<string | null>(null);

  useEffect(() => {
    latest.current = query;

    void fetchAuditPage(JSON.parse(key) as AuditFilters, null)
      .then((page) => {
        if (latest.current === query) {
          setTrail({ query, status: 'ready', entries: page.entries, nextCursor: page.nextCursor });
        }
      })
      .catch((error: AppError) => {
        if (latest.current === query) {
          setTrail({ query, status: 'failed', error });
        }
      });
  }, [key, query]);

  const current = trail?.query === query ? trail : null;
  const currentMore = more?.query === query ? more : null;

  const loadMore = useCallback(() => {
    if (current?.status !== 'ready' || current.nextCursor === null) {
      return;
    }

    if (moreInFlight.current === query) {
      return;
    }

    moreInFlight.current = query;
    setMore({ query, isLoading: true, error: null });

    void fetchAuditPage(JSON.parse(key) as AuditFilters, current.nextCursor)
      .then((page) => {
        if (latest.current !== query) {
          return;
        }

        setTrail((previous) =>
          previous?.query === query && previous.status === 'ready'
            ? {
                ...previous,
                entries: [...previous.entries, ...page.entries],
                nextCursor: page.nextCursor,
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
  }, [current, key, query]);

  const reload = useCallback(() => {
    setAttempt((previous) => previous + 1);
  }, []);

  return {
    isLoading: current === null,
    error: current?.status === 'failed' ? current.error : null,
    entries: current?.status === 'ready' ? current.entries : [],
    hasMore: current?.status === 'ready' && current.nextCursor !== null,
    isLoadingMore: currentMore?.isLoading ?? false,
    moreError: currentMore?.error ?? null,
    loadMore,
    reload,
  };
}
