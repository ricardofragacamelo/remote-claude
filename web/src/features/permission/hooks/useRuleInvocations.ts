import { useCallback } from 'react';
import type { AuditTrailEntry } from '@remote-claude/contracts';

import { usePagedList } from '@/shared/hooks/usePagedList';
import type { PagedList } from '@/shared/hooks/usePagedList';
import { fetchRuleInvocations } from '../services/rule.service';

export interface RuleInvocations extends Omit<PagedList<AuditTrailEntry>, 'items' | 'setItems'> {
  readonly invocations: readonly AuditTrailEntry[];
}

/**
 * The invocations a rule answered, a page at a time — "14 usos" opens to these same lines (B-11,
 * S-165). The cursor here is the route's own numeric offset, never the base64 one the listing
 * paginates by; `usePagedList` only ever sees it as the opaque string it already is on the wire.
 */
export function useRuleInvocations(ruleId: string): RuleInvocations {
  const fetchPage = useCallback(
    (cursor: string | null) =>
      fetchRuleInvocations(ruleId, cursor === null ? null : Number(cursor)).then((result) => ({
        items: result.invocations,
        nextCursor: result.nextCursor,
      })),
    [ruleId],
  );
  const { items, isLoading, error, hasMore, isLoadingMore, moreError, loadMore, reload } =
    usePagedList(ruleId, fetchPage);

  return {
    invocations: items,
    isLoading,
    error,
    hasMore,
    isLoadingMore,
    moreError,
    loadMore,
    reload,
  };
}
