import { useCallback } from 'react';

import { useLoad } from '@/shared/hooks/useLoad';
import type { Loaded } from '@/shared/hooks/useLoad';
import { fetchRuleHistory } from '../services/rule.service';
import type { RuleHistory } from '../types/rule';

/** The events of one rule — granted, validity changed, revoked, restored, exported, imported
 * (B-11, B-22). */
export function useRuleHistory(ruleId: string): Loaded<RuleHistory> {
  const fetch = useCallback(() => fetchRuleHistory(ruleId), [ruleId]);

  return useLoad(fetch);
}
