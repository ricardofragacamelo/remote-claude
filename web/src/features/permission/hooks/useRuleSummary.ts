import { useCallback } from 'react';

import { useLoad } from '@/shared/hooks/useLoad';
import type { Loaded } from '@/shared/hooks/useLoad';
import { fetchRuleSummary } from '../services/rule.service';
import type { RuleFilters, RuleSummary } from '../types/rule';

/**
 * Counts over the same predicate the listing reads — the tab labels and the nav badge read this,
 * never the page on screen, so a tab's count never depends on how far the person has scrolled
 * (plan 15, B-10, B-20).
 */
export function useRuleSummary(filters: RuleFilters): Loaded<RuleSummary> {
  const key = JSON.stringify(filters);
  const fetch = useCallback(() => fetchRuleSummary(JSON.parse(key) as RuleFilters), [key]);

  return useLoad(fetch);
}
