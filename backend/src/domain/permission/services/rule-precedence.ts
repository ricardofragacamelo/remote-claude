import type { PermissionMode } from '@domain/session';
import type { PermissionRule, RuleSubject } from '../entities/permission-rule.entity';

/** One invocation, as the rules are asked about it. */
export interface RuleQuestion {
  readonly subject: RuleSubject;
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;

  /** The mode the session is in **now** — it can change while the session runs. */
  readonly permissionMode: PermissionMode;
  readonly now: Date;
}

/**
 * The rule that answers an invocation, or `null` when a human has to.
 *
 * Whenever two answers are possible, the more restrictive one wins
 * ([D-11](../../../../../docs/plans/03-rules-and-audit/decisions.md)):
 *
 * - **any `deny` that matches refuses**, whatever `allow` sits beside it and whatever its scope.
 *   "Deny beats allow in the same scope" is the weakest reading of the rule, and there is no case
 *   where a wider `allow` overriding a narrower `deny` is the safer outcome;
 * - **in `plan`, no `allow` answers.** Somebody who put the session into planning did not ask for
 *   an old rule to execute on their behalf, so the question goes to them. A `deny` still refuses:
 *   refusing is never less restrictive than asking.
 *
 * Pure, and in the domain, for the same reason the matcher is: it is a security decision, and a
 * security decision is tested by boundary rather than through a database.
 */
export function answeringRule(
  rules: readonly PermissionRule[],
  question: RuleQuestion,
): PermissionRule | null {
  const matching = rules.filter((rule) =>
    rule.matches(question.subject, question.toolName, question.input, question.now),
  );

  const refusal = matching.find((rule) => rule.decision === 'deny');
  if (refusal !== undefined) {
    return refusal;
  }

  if (question.permissionMode === 'plan') {
    return null;
  }

  return matching[0] ?? null;
}
