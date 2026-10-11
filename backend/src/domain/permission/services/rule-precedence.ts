import type { CanonicalTool } from '@domain/engine';
import type { PermissionMode } from '@domain/session';
import type { PermissionRule, RuleSubject } from '../entities/permission-rule.entity';
import { answeredByRule } from './mode-approval';
import { commandsOf } from './shell-syntax';

/** One invocation, as the rules are asked about it. */
export interface RuleQuestion {
  readonly subject: RuleSubject;

  /**
   * The call as the engine's adapter read it: its kind decides whether a rule may answer it, its
   * subject is what a rule matches, and its origin says which engine — a rule restricted to another
   * one does not answer it (plan 28, B-31).
   */
  readonly tool: Pick<CanonicalTool, 'kind' | 'subject' | 'origin'>;

  /** The mode the session is in **now** — it can change while the session runs. */
  readonly permissionMode: PermissionMode;
  readonly now: Date;
}

/**
 * The rule that answers an invocation, or `null` when a human has to.
 *
 * **No `allow` answers a call that asks the person** — a `question`, a `plan`
 * ({@link answeredByRule}). With the canonical grammar no rule can even name one (plan 28, B-32):
 * the check stays, so the guarantee does not rest on the grammar alone.
 *
 * Whenever two answers are possible, the more restrictive one wins
 * ([D-11](../../../../../docs/plans/03-rules-and-audit/decisions.md)):
 *
 * - **any `deny` that matches refuses**, whatever `allow` sits beside it and whatever its scope.
 *   "Deny beats allow in the same scope" is the weakest reading of the rule, and there is no case
 *   where a wider `allow` overriding a narrower `deny` is the safer outcome;
 * - **in `readOnly`, no `allow` answers.** Somebody who made the session read-only did not ask for
 *   an old rule to execute on their behalf, so the question goes to them. A `deny` still refuses:
 *   refusing is never less restrictive than asking (plan 28, B-32).
 *
 * - **a shell line of several commands is allowed when every command is**
 *   ([23 · D-07](../../../../../docs/plans/23-fluid-permissions/decisions.md)): `git push 2>&1 |
 *   tail -5` with `shell(git push:*)` and `shell(tail:*)`. Each command is read as a line of its own,
 *   so a prefix still respects its token boundary, and a line {@link commandsOf} cannot read safely
 *   is asked about. The rule answering is the first command's (D-11).
 *
 * Pure, and in the domain, for the same reason the matcher is: it is a security decision, and a
 * security decision is tested by boundary rather than through a database.
 */
export function answeringRule(
  rules: readonly PermissionRule[],
  question: RuleQuestion,
): PermissionRule | null {
  const matching = rules.filter(
    (rule) =>
      answeredByRule(rule.decision, question.tool.kind) &&
      rule.matches(question.subject, question.tool, question.now),
  );

  const refusal = matching.find((rule) => rule.decision === 'deny');
  if (refusal !== undefined) {
    return refusal;
  }

  if (question.permissionMode === 'readOnly') {
    return null;
  }

  return matching[0] ?? commandByCommand(rules, question);
}

/** The rule of the first command, when every command of a shell line is allowed by some rule. */
function commandByCommand(
  rules: readonly PermissionRule[],
  question: RuleQuestion,
): PermissionRule | null {
  const line = question.tool.kind === 'shell' ? question.tool.subject.command : undefined;
  const commands = line === undefined ? null : commandsOf(line);

  // One command identical to the line was already asked about, as the line.
  if (commands === null || (commands.length === 1 && commands[0] === line?.trim())) {
    return null;
  }

  const answering = commands.map(
    (command) =>
      rules.find(
        (rule) =>
          rule.decision === 'allow' &&
          rule.matches(
            question.subject,
            { ...question.tool, subject: { ...question.tool.subject, command } },
            question.now,
          ),
      ) ?? null,
  );

  return answering.every((rule) => rule !== null) ? (answering[0] ?? null) : null;
}
