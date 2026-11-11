import type { RuleEvaluation } from '../types/rule';

export interface Verdict {
  readonly messageKey: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/**
 * The verdict a test reads in words (S-196, S-197) — "would be allowed without asking, by rule
 * X", "would be blocked by rule Y — it beats rule Z, which would allow it", "{agent} would ask
 * you: no rule matches", "would ask: in read-only mode, rules that allow do not answer". Read off
 * `outcome`/`reasons`/`matching`, never recomputed: the server already decided, this only picks
 * which sentence says so.
 */
export function verdictOf(evaluation: RuleEvaluation): Verdict {
  const { outcome, answeringRule, matching, reasons } = evaluation;

  if (outcome !== 'ask' && answeringRule !== null) {
    if (reasons.includes('denyWins')) {
      const losingAllow = matching.find(
        (rule) => rule.id !== answeringRule.id && rule.decision === 'allow',
      );

      if (losingAllow !== undefined) {
        return {
          messageKey: 'rules.test.verdictDeniedOverAllow',
          params: { denyPattern: answeringRule.pattern, allowPattern: losingAllow.pattern },
        };
      }
    }

    return {
      messageKey:
        outcome === 'allow' ? 'rules.test.verdictAllowedByRule' : 'rules.test.verdictDeniedByRule',
      params: { pattern: answeringRule.pattern },
    };
  }

  if (reasons.includes('readOnlyMode')) {
    return { messageKey: 'rules.test.verdictAskReadOnly', params: {} };
  }

  return { messageKey: 'rules.test.verdictAskNoRule', params: {} };
}
