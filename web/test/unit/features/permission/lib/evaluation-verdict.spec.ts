import { describe, expect, it } from 'vitest';

import { verdictOf } from '@/features/permission/lib/evaluation-verdict';
import type { RuleEvaluation } from '@/features/permission/types/rule';

/** Only the fields `verdictOf` itself ever reads — the rest of a real `PermissionRule` plays no
 * part in picking the sentence, so the fixture never carries it. */
function rule(id: string, pattern: string, decision: 'allow' | 'deny') {
  return { id, pattern, decision } as unknown as RuleEvaluation['matching'][number];
}

function evaluation(fields: Partial<RuleEvaluation>): RuleEvaluation {
  return {
    outcome: 'ask',
    answeringRule: null,
    matching: [],
    reasons: [],
    caveats: [],
    ...fields,
  } as RuleEvaluation;
}

describe('verdictOf — the verdict a test reads in words (plan 15, B-28, S-196, S-197)', () => {
  it('says it would be allowed, by the rule that answers, with no competing deny', () => {
    const allow = rule('rule_1', 'shell(git status)', 'allow');
    expect(
      verdictOf(
        evaluation({
          outcome: 'allow',
          answeringRule: allow,
          matching: [allow],
          reasons: ['ruleAnswers'],
        }),
      ),
    ).toEqual({
      messageKey: 'rules.test.verdictAllowedByRule',
      params: { pattern: 'shell(git status)' },
    });
  });

  it('says it would be blocked, by the rule that answers, with no competing allow', () => {
    const deny = rule('rule_1', 'shell(rm -rf /)', 'deny');
    expect(
      verdictOf(
        evaluation({
          outcome: 'deny',
          answeringRule: deny,
          matching: [deny],
          reasons: ['ruleAnswers'],
        }),
      ),
    ).toEqual({
      messageKey: 'rules.test.verdictDeniedByRule',
      params: { pattern: 'shell(rm -rf /)' },
    });
  });

  it('says the deny beats the allow, once both match and the deny answers', () => {
    const deny = rule('rule_deny', 'shell(rm -rf /)', 'deny');
    const allow = rule('rule_allow', 'shell', 'allow');
    expect(
      verdictOf(
        evaluation({
          outcome: 'deny',
          answeringRule: deny,
          matching: [allow, deny],
          reasons: ['ruleAnswers', 'denyWins'],
        }),
      ),
    ).toEqual({
      messageKey: 'rules.test.verdictDeniedOverAllow',
      params: { denyPattern: 'shell(rm -rf /)', allowPattern: 'shell' },
    });
  });

  it('falls back to the plain deny sentence when `denyWins` names no actual losing allow', () => {
    // Real server data would never say `denyWins` with nothing in `matching` for it to have beaten —
    // but `verdictOf` reads an external contract, not its own invariant, so this stays a reachable,
    // deliberately defensive branch rather than dead code.
    const deny = rule('rule_deny', 'shell(rm -rf /)', 'deny');
    expect(
      verdictOf(
        evaluation({
          outcome: 'deny',
          answeringRule: deny,
          matching: [deny],
          reasons: ['ruleAnswers', 'denyWins'],
        }),
      ),
    ).toEqual({
      messageKey: 'rules.test.verdictDeniedByRule',
      params: { pattern: 'shell(rm -rf /)' },
    });
  });

  it('never counts the answering rule itself as its own competing allow', () => {
    // Same id, decision `allow` — `denyWins` with the ONLY matching rule being the answering one
    // itself (an `allow` outcome can never reach here, but a malformed payload could) still falls
    // through to the plain branch, never crashing on `undefined.pattern`.
    const rule1 = rule('rule_1', 'shell', 'allow');
    expect(
      verdictOf(
        evaluation({
          outcome: 'allow',
          answeringRule: rule1,
          matching: [rule1],
          reasons: ['ruleAnswers', 'denyWins'],
        }),
      ),
    ).toEqual({
      messageKey: 'rules.test.verdictAllowedByRule',
      params: { pattern: 'shell' },
    });
  });

  it('says {agent} would ask, in read-only mode, when that is why nothing answers', () => {
    expect(verdictOf(evaluation({ outcome: 'ask', reasons: ['readOnlyMode'] }))).toEqual({
      messageKey: 'rules.test.verdictAskReadOnly',
      params: {},
    });
  });

  it('says {agent} would ask, with no rule matching, as the default', () => {
    expect(verdictOf(evaluation({ outcome: 'ask', reasons: ['noRule'] }))).toEqual({
      messageKey: 'rules.test.verdictAskNoRule',
      params: {},
    });
  });

  it('asks the same default way for an `ask` outcome with no reasons at all', () => {
    expect(verdictOf(evaluation({ outcome: 'ask', reasons: [] }))).toEqual({
      messageKey: 'rules.test.verdictAskNoRule',
      params: {},
    });
  });
});
