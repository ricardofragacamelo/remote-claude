import { useCallback } from 'react';

import { usePagedList } from '@/shared/hooks/usePagedList';
import type { PagedList } from '@/shared/hooks/usePagedList';
import { fetchRules } from '../services/rule.service';
import type { PermissionRule, RuleListQuery } from '../types/rule';

/** What the screen gets: the four states of the first page, and the way to the next ones. */
export interface Rules extends Omit<PagedList<PermissionRule>, 'items' | 'setItems'> {
  readonly rules: readonly PermissionRule[];

  /**
   * Replaces one rule in place, from an answer already in hand — a changed validity, most often.
   * Never a network call: the screen already has the fresher rule, and asking the server for it
   * again would be the one case {@link reload} exists to avoid (plan 15, S-16).
   */
  updateRule(rule: PermissionRule): void;

  /**
   * Takes a rule out of the page on screen, from the answer to revoking it — not from
   * {@link reload}, which would reread the whole page and could reorder it under somebody's
   * pointer still reading another row (plan 15, S-16, S-19).
   */
  removeRule(ruleId: string): void;
}

/**
 * The query as one stable string, so a new object with the same filters and sort is not a new
 * fetch — the field order is fixed, and that order is what the fetch depends on (plan 15, B-20).
 */
export function ruleQueryKey(query: RuleListQuery): string {
  const { status, scope, decision, engine, kind, folder, q, expiresBefore, sort, order } = query;

  return JSON.stringify({
    status,
    scope,
    decision,
    engine,
    kind,
    folder,
    q,
    expiresBefore,
    sort,
    order,
  });
}

/**
 * The rules, a page at a time — read and written to the URL's search by the caller (plan 15,
 * B-20): this hook only reads whatever `query` it is given. The paging itself —
 * {@link import('@/shared/hooks/usePagedList').usePagedList} — is the trail's own, shared rather
 * than reimplemented: a new query starts again from the top with the old answer dropped, a failed
 * "load more" keeps what is on screen, and a second click on it asks nothing while the first is
 * still in flight.
 */
export function useRules(query: RuleListQuery): Rules {
  const key = ruleQueryKey(query);
  const fetchPage = useCallback(
    (cursor: string | null) =>
      fetchRules(JSON.parse(key) as RuleListQuery, cursor).then((result) => ({
        items: result.rules,
        nextCursor: result.nextCursor,
      })),
    [key],
  );
  const { items, setItems, ...paged } = usePagedList(key, fetchPage);

  const updateRule = useCallback(
    (rule: PermissionRule) => {
      setItems((current) =>
        current.map((candidate) => (candidate.id === rule.id ? rule : candidate)),
      );
    },
    [setItems],
  );

  const removeRule = useCallback(
    (ruleId: string) => {
      setItems((current) => current.filter((candidate) => candidate.id !== ruleId));
    },
    [setItems],
  );

  return { ...paged, rules: items, updateRule, removeRule };
}
