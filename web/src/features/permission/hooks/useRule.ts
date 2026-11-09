import { useCallback } from 'react';

import { useLoad } from '@/shared/hooks/useLoad';
import type { Loaded } from '@/shared/hooks/useLoad';
import { fetchRule } from '../services/rule.service';
import type { PermissionRule } from '../types/rule';

/**
 * One rule, opened by id — from the trail entry it answered, most of the time (plan 15, B-20).
 */
export function useRule(ruleId: string): Loaded<PermissionRule> {
  const fetch = useCallback(() => fetchRule(ruleId), [ruleId]);

  return useLoad(fetch);
}
