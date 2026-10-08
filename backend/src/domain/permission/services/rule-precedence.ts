import type { PermissionMode } from '@domain/session';
import type { PermissionRule, RuleSubject } from '../entities/permission-rule.entity';
import { answeredByRule } from './mode-approval';
import { matchedInput } from './rule-pattern';
import { commandsOf, SHELL_TOOLS } from './shell-syntax';

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
 * **No `allow` answers a tool that asks the person** — `AskUserQuestion`, `ExitPlanMode`
 * ({@link answeredByRule}). One already recorded is simply not read as an answer, and the caller can
 * tell it was there with {@link ignoredAllow} ([24 · D-26](../../../../../docs/plans/24-structured-questions/decisions.md)).
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
 * - **a shell line of several commands is allowed when every command is**
 *   ([23 · D-07](../../../../../docs/plans/23-fluid-permissions/decisions.md)): `git push 2>&1 |
 *   tail -5` with `Bash(git push:*)` and `Bash(tail:*)`. Each command is read as a line of its own,
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
      answeredByRule(rule.decision, question.toolName) &&
      rule.matches(question.subject, question.toolName, question.input, question.now),
  );

  const refusal = matching.find((rule) => rule.decision === 'deny');
  if (refusal !== undefined) {
    return refusal;
  }

  if (question.permissionMode === 'plan') {
    return null;
  }

  return matching[0] ?? commandByCommand(rules, question);
}

/**
 * An `allow` that matches an invocation it may not answer, if there is one — what a lookup reports
 * so a rule that stopped answering is not mistaken for one that was revoked.
 */
export function ignoredAllow(
  rules: readonly PermissionRule[],
  question: RuleQuestion,
): PermissionRule | null {
  if (answeredByRule('allow', question.toolName)) {
    return null;
  }

  return (
    rules.find(
      (rule) =>
        rule.decision === 'allow' &&
        rule.matches(question.subject, question.toolName, question.input, question.now),
    ) ?? null
  );
}

/** The rule of the first command, when every command of a shell line is allowed by some rule. */
function commandByCommand(
  rules: readonly PermissionRule[],
  question: RuleQuestion,
): PermissionRule | null {
  const line = SHELL_TOOLS.has(question.toolName) ? matchedInput(question.input) : null;
  const commands = line === null ? null : commandsOf(line);

  // One command identical to the line was already asked about, as the line.
  if (commands === null || (commands.length === 1 && commands[0] === line?.trim())) {
    return null;
  }

  const answering = commands.map(
    (command) =>
      rules.find(
        (rule) =>
          rule.decision === 'allow' &&
          rule.matches(question.subject, question.toolName, { command }, question.now),
      ) ?? null,
  );

  return answering.every((rule) => rule !== null) ? (answering[0] ?? null) : null;
}
