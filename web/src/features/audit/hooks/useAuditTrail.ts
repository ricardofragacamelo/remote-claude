import { useCallback } from 'react';

import { usePagedList } from '@/shared/hooks/usePagedList';
import type { PagedList } from '@/shared/hooks/usePagedList';
import { fetchAuditPage } from '../services/audit.service';
import type { AuditEntry, AuditFilters } from '../types/audit';

/** What the screen gets: the four states of the first page, and the way to the next ones. */
export interface AuditTrail extends Omit<PagedList<AuditEntry>, 'items' | 'setItems'> {
  readonly entries: readonly AuditEntry[];
}

/**
 * The filters as one stable string, so a new object with the same filters is not a new query.
 *
 * The field order is fixed: the key is what the fetch depends on, and two keys for one filter
 * would be a reload nobody asked for.
 */
export function auditFiltersKey(filters: AuditFilters): string {
  const { sessionId, toolName, decision, from, to } = filters;

  return JSON.stringify({ sessionId, toolName, decision, from, to });
}

/**
 * The trail, a page at a time — on
 * {@link import('@/shared/hooks/usePagedList').usePagedList}, shared with the rules screen
 * (plan 15, B-20): a new filter starts again from the top with the old answer dropped (S-78), a
 * failed "load more" keeps what is on screen (S-77), and a second click on it asks nothing while
 * the first is still in flight (S-80).
 */
export function useAuditTrail(filters: AuditFilters): AuditTrail {
  const key = auditFiltersKey(filters);
  const fetchPage = useCallback(
    (cursor: string | null) =>
      fetchAuditPage(JSON.parse(key) as AuditFilters, cursor).then((result) => ({
        items: result.entries,
        nextCursor: result.nextCursor,
      })),
    [key],
  );
  const { items, isLoading, error, hasMore, isLoadingMore, moreError, loadMore, reload } =
    usePagedList(key, fetchPage);

  return { entries: items, isLoading, error, hasMore, isLoadingMore, moreError, loadMore, reload };
}
