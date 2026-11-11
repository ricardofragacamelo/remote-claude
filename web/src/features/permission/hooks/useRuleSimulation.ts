import { useAsyncRead } from '@/shared/hooks/useAsyncRead';
import type { AsyncRead } from '@/shared/hooks/useAsyncRead';
import { simulateRules } from '../services/rule.service';
import type { RuleSimulation, SimulateRulesInput } from '../types/rule';

/**
 * "If this rule existed" (D-15) — against the caller's last invocations, asked fresh whenever
 * `input` changes (plan 15, B-27/B-29, S-200). `null` while there is no draft worth asking about
 * yet.
 */
export function useRuleSimulation(input: SimulateRulesInput | null): AsyncRead<RuleSimulation> {
  return useAsyncRead(input, simulateRules);
}
