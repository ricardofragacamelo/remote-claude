import { answeringRule } from '@domain/permission';
import type { PermissionRule, RuleQuestion } from '@domain/permission';
import type { PermissionRegistry } from './permission-registry';
import type { PermissionRuleRepository } from './ports/permission-rule.repository';

/**
 * What the rule book does when it cannot read the persisted rules.
 *
 * A callback rather than a logger, for the same reason as the deadline's: `application/` has none.
 */
export type RuleLookupFailureReporter = (error: unknown, requestId: string) => void;

/**
 * Every rule that may answer a request, from both places rules live.
 *
 * `session` rules are in the registry, the others in the database; precedence is the domain's
 * ({@link answeringRule}). This class only gathers them, and decides one thing of its own:
 *
 * **a lookup that fails asks a human.** Not the session rules alone, because a `deny` among the
 * unread ones would have been ignored in favour of an `allow` — and not a refusal, because a
 * database blip is not a decision anybody made. Asking is the one outcome that is never less
 * restrictive than the truth.
 *
 * Read on every request and never cached, which is what makes a revocation take effect in a
 * session that is already running.
 */
export class PermissionRuleBook {
  constructor(
    private readonly registry: PermissionRegistry,
    private readonly rules: PermissionRuleRepository,
    private readonly reportFailure: RuleLookupFailureReporter,
  ) {}

  async answering(requestId: string, question: RuleQuestion): Promise<PermissionRule | null> {
    let persisted: readonly PermissionRule[];

    try {
      persisted = await this.rules.findApplicable(
        question.subject.userId,
        question.subject.projectPath,
        question.now,
      );
    } catch (error) {
      this.reportFailure(error, requestId);
      return null;
    }

    return answeringRule(
      [...this.registry.rulesOf(question.subject.sessionId), ...persisted],
      question,
    );
  }
}
