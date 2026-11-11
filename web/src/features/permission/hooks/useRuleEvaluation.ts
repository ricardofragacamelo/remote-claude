import { useAsyncRead } from '@/shared/hooks/useAsyncRead';
import type { AsyncRead } from '@/shared/hooks/useAsyncRead';
import { evaluateRule } from '../services/rule.service';
import type { EvaluateRuleInput, RuleEvaluation } from '../types/rule';

/**
 * What testing a command against the rules in force decides — asked fresh whenever `input`
 * changes (plan 15, B-28, S-196). `null` while there is nothing worth asking yet: a kind not
 * chosen, a subject still empty on a kind that needs one. The caller debounces its own `input`
 * before this, if it wants to.
 */
export function useRuleEvaluation(input: EvaluateRuleInput | null): AsyncRead<RuleEvaluation> {
  return useAsyncRead(input, evaluateRule);
}
