import { useLoad } from '@/shared/hooks/useLoad';
import type { Loaded } from '@/shared/hooks/useLoad';
import { fetchRuleTemplates } from '../services/rule.service';
import type { RuleTemplates } from '../types/rule';

/** The catalog of pre-built rule bundles (plan 15, B-30, D-16) — read once, with a retry. */
export function useRuleTemplates(): Loaded<RuleTemplates> {
  return useLoad(fetchRuleTemplates);
}
