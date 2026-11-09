import { answeredByMode, matchingRules, refusedByMode } from '@domain/permission';
import type { PermissionRule, RuleQuestion } from '@domain/permission';
import type { PermissionMode } from '@domain/engine';

export type DecisionOutcome = 'allow' | 'deny' | 'ask';
export type DecisionReason =
  'ruleAnswers' | 'denyWins' | 'readOnlyMode' | 'allowAllMode' | 'noRule';

export interface Decided {
  readonly outcome: DecisionOutcome;
  readonly answeringRule: PermissionRule | null;
  readonly matching: readonly PermissionRule[];
  readonly reasons: readonly DecisionReason[];
}

/**
 * The precedence a live session uses, over any set of rules and any question — without a session,
 * a registry or a repository: the one place {@link import('./evaluate-permission.use-case').EvaluatePermissionUseCase}
 * (B-14) and {@link import('./simulate-permission-rules.use-case').SimulatePermissionRulesUseCase}
 * (B-16) both ask "what would answer this?", so the two never drift (plan 15, D-12).
 *
 * 1. the mode, for a change it refuses outright (`readOnly`);
 * 2. a `deny` that matches, which always wins;
 * 3. an `allow` that matches, unless the mode is `readOnly` (no rule allows there);
 * 4. the mode again, for what Permitir tudo would let through with no rule;
 * 5. otherwise, a human is asked.
 */
export function decideOutcome(
  rules: readonly PermissionRule[],
  question: RuleQuestion,
  mode: PermissionMode,
): Decided {
  const matching = matchingRules(rules, question);

  if (refusedByMode(mode, question.tool.kind)) {
    return { outcome: 'deny', answeringRule: null, matching, reasons: ['readOnlyMode'] };
  }

  const refusal = matching.find((rule) => rule.decision === 'deny');
  if (refusal !== undefined) {
    return { outcome: 'deny', answeringRule: refusal, matching, reasons: ['denyWins'] };
  }

  const allow =
    mode === 'readOnly' ? undefined : matching.find((rule) => rule.decision === 'allow');
  if (allow !== undefined) {
    return { outcome: 'allow', answeringRule: allow, matching, reasons: ['ruleAnswers'] };
  }

  if (answeredByMode(mode, question.tool.kind)) {
    return { outcome: 'allow', answeringRule: null, matching, reasons: ['allowAllMode'] };
  }

  return {
    outcome: 'ask',
    answeringRule: null,
    matching,
    reasons: mode === 'readOnly' ? ['readOnlyMode'] : ['noRule'],
  };
}
