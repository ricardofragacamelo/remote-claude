import type { UserId } from '@domain/auth';
import type { SessionId } from '@domain/session';
import { PermissionRuleExpiryTooLongError } from '../errors/permission-rule-expiry-too-long.error';
import { parseRulePattern, ruleMatches } from '../services/rule-pattern';
import type { RulePattern } from '../services/rule-pattern';
import type { PermissionScope } from '../value-objects/permission-scope.value-object';
import type { PermissionDecision } from './permission-request.entity';

/** What creating a rule needs to know. */
export interface PermissionRuleDraft {
  readonly id: string;

  /** Whose rule it is. A rule belongs to a person, never to the machine. */
  readonly userId: UserId;

  /** The session it was granted in. `null` once scopes wider than a session exist. */
  readonly sessionId: SessionId | null;

  /** The pattern, in the grammar of the Claude Code settings. */
  readonly pattern: string;

  readonly decision: PermissionDecision;
  readonly scope: PermissionScope;
  readonly createdAt: Date;

  /** When it stops resolving anything. Every rule expires; there is no permanent one. */
  readonly expiresAt: Date;
}

/**
 * A decision that outlives the request that produced it.
 *
 * Three rules hold it together, and each one closes a hole that is easy to leave open.
 *
 * **A rule is a person's.** `userId` is part of the match and not only of the creation: a rule of
 * one user resolving another's request would turn "I trust this command" into "anybody on this
 * installation trusts this command".
 *
 * **Every rule expires.** There is no permanent grant, because the screen that revokes one does
 * not exist yet — and a grant nobody can take back is a grant nobody should be able to make.
 * An expired rule resolves nothing and **stays in the list**, marked: "it is gone" and "it stopped
 * applying" are different answers to somebody asking what authorised a command.
 *
 * **The pattern is validated when the rule is built.** Not at the first match, where a malformed
 * pattern would simply never fire and look like a rule that was never granted.
 */
export class PermissionRule {
  private constructor(
    readonly id: string,
    readonly userId: UserId,
    readonly sessionId: SessionId | null,
    readonly pattern: RulePattern,

    /** The pattern as written, which is literally what goes back to the SDK. */
    readonly ruleContent: string,
    readonly decision: PermissionDecision,
    readonly scope: PermissionScope,
    readonly createdAt: Date,
    readonly expiresAt: Date,
  ) {}

  /**
   * @param maxLifetimeMs the ceiling the installation puts on a rule's life
   * @throws {import('../errors/permission-rule-pattern-invalid.error').PermissionRulePatternInvalidError}
   *   for a pattern outside the grammar
   * @throws {PermissionRuleExpiryTooLongError} when the rule was asked to outlive the ceiling
   */
  static create(draft: PermissionRuleDraft, maxLifetimeMs: number): PermissionRule {
    const lifetime = draft.expiresAt.getTime() - draft.createdAt.getTime();

    if (lifetime > maxLifetimeMs) {
      throw new PermissionRuleExpiryTooLongError(maxLifetimeMs);
    }

    return new PermissionRule(
      draft.id,
      draft.userId,
      draft.sessionId,
      parseRulePattern(draft.pattern),
      draft.pattern.trim(),
      draft.decision,
      draft.scope,
      draft.createdAt,
      draft.expiresAt,
    );
  }

  /** Whether the rule still applies at `now`. */
  isActiveAt(now: Date): boolean {
    return now.getTime() < this.expiresAt.getTime();
  }

  /**
   * Whether this rule answers that invocation, for that person, at that moment.
   *
   * A pure rule with no I/O — which is what lets it be tested by boundary, and what the UI reads
   * to tell somebody how far a rule they are about to grant would reach.
   */
  matches(
    userId: UserId,
    toolName: string,
    input: Readonly<Record<string, unknown>>,
    now: Date,
  ): boolean {
    return (
      this.userId.equals(userId) &&
      this.isActiveAt(now) &&
      ruleMatches(this.pattern, toolName, input)
    );
  }
}
