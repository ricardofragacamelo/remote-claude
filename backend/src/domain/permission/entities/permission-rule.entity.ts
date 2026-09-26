import type { UserId } from '@domain/auth';
import type { SessionId } from '@domain/session';
import { PermissionRuleExpiryInvalidError } from '../errors/permission-rule-expiry-invalid.error';
import { PermissionRuleExpiryTooLongError } from '../errors/permission-rule-expiry-too-long.error';
import { PermissionScopeUnsupportedError } from '../errors/permission-scope-unsupported.error';
import { parseRulePattern, ruleMatches } from '../services/rule-pattern';
import type { RulePattern } from '../services/rule-pattern';
import type { PermissionScope } from '../value-objects/permission-scope.value-object';
import type { PermissionDecision } from './permission-request.entity';

/** The scopes a rule can have. `once` leaves nothing behind, so there is no rule of it. */
export type PermissionRuleScope = Exclude<PermissionScope, 'once'>;

/**
 * Where a rule stands at a given moment.
 *
 * Three values and not a boolean, because the list shows all three differently: an expired rule
 * stays listed and marked, a revoked one leaves the list, and both have stopped answering.
 */
export type PermissionRuleStatus = 'active' | 'expired' | 'revoked';

/** Who is asking, and from where — what decides whether a rule's scope reaches a request. */
export interface RuleSubject {
  readonly userId: UserId;
  readonly sessionId: SessionId;

  /** The workspace root the session runs in, or `null` when it is not known. */
  readonly projectPath: string | null;
}

/** What creating a rule needs to know. */
export interface PermissionRuleDraft {
  readonly id: string;

  /** Whose rule it is. A rule belongs to a person, never to the machine. */
  readonly userId: UserId;

  /** The session it lives in. Set for `session`, and only for `session`. */
  readonly sessionId: SessionId | null;

  /** The workspace root it covers. Set for `project`, and only for `project`. */
  readonly projectPath: string | null;

  /** The pattern, in the grammar of the Claude Code settings. */
  readonly pattern: string;

  readonly decision: PermissionDecision;
  readonly scope: PermissionRuleScope;
  readonly createdAt: Date;

  /** When it stops resolving anything. Every rule expires; there is no permanent one. */
  readonly expiresAt: Date;
}

/** A rule as it was stored, including whether it has been taken back. */
export interface PermissionRuleSnapshot extends PermissionRuleDraft {
  readonly revokedAt: Date | null;
}

/**
 * A decision that outlives the request that produced it.
 *
 * Four rules hold it together, and each one closes a hole that is easy to leave open.
 *
 * **A rule is a person's.** `userId` is part of the match and not only of the creation: a rule of
 * one user resolving another's request would turn "I trust this command" into "anybody on this
 * installation trusts this command".
 *
 * **The scope says where, and nothing else can widen it.** A `session` rule names its session, a
 * `project` rule names its workspace, and only `always` names neither. A draft whose fields
 * disagree with its scope is refused rather than read generously.
 *
 * **Every rule expires.** An expired rule resolves nothing and **stays in the list**, marked:
 * "it is gone" and "it stopped applying" are different answers to somebody asking what authorised
 * a command. A **revoked** one is gone from the list — and still here, because the trail that
 * points at it has to be able to say what it was.
 *
 * **The pattern is validated when the rule is built.** Not at the first match, where a malformed
 * pattern would simply never fire and look like a rule that was never granted.
 */
export class PermissionRule {
  private constructor(
    readonly id: string,
    readonly userId: UserId,
    readonly sessionId: SessionId | null,
    readonly projectPath: string | null,
    readonly pattern: RulePattern,

    /** The pattern as written, which is literally the grammar of the Claude Code settings. */
    readonly ruleContent: string,
    readonly decision: PermissionDecision,
    readonly scope: PermissionRuleScope,
    readonly createdAt: Date,
    readonly expiresAt: Date,
    readonly revokedAt: Date | null,
  ) {}

  /**
   * @param maxLifetimeMs the ceiling the installation puts on a rule's life
   * @throws {import('../errors/permission-rule-pattern-invalid.error').PermissionRulePatternInvalidError}
   *   for a pattern outside the grammar
   * @throws {PermissionRuleExpiryInvalidError} when it would expire before it exists
   * @throws {PermissionRuleExpiryTooLongError} when the rule was asked to outlive the ceiling
   * @throws {PermissionScopeUnsupportedError} when the fields disagree with the scope
   */
  static create(draft: PermissionRuleDraft, maxLifetimeMs: number): PermissionRule {
    const lifetime = draft.expiresAt.getTime() - draft.createdAt.getTime();

    if (lifetime <= 0) {
      throw new PermissionRuleExpiryInvalidError(draft.expiresAt);
    }

    if (lifetime > maxLifetimeMs) {
      throw new PermissionRuleExpiryTooLongError(maxLifetimeMs);
    }

    if (!placedWhereItsScopeSays(draft)) {
      throw new PermissionScopeUnsupportedError(draft.scope);
    }

    return PermissionRule.restore({ ...draft, revokedAt: null });
  }

  /**
   * Rehydrates a rule the repository read back.
   *
   * The ceiling is **not** checked again: it is a question about the moment of creation, and a
   * rule granted under last month's ceiling is still the rule somebody granted.
   */
  static restore(snapshot: PermissionRuleSnapshot): PermissionRule {
    const written = snapshot.pattern.trim();

    return new PermissionRule(
      snapshot.id,
      snapshot.userId,
      snapshot.sessionId,
      snapshot.projectPath,
      parseRulePattern(written),
      written,
      snapshot.decision,
      snapshot.scope,
      snapshot.createdAt,
      snapshot.expiresAt,
      snapshot.revokedAt,
    );
  }

  statusAt(now: Date): PermissionRuleStatus {
    if (this.revokedAt !== null) {
      return 'revoked';
    }

    return now.getTime() < this.expiresAt.getTime() ? 'active' : 'expired';
  }

  /** Whether the rule still applies at `now`: neither expired nor revoked. */
  isActiveAt(now: Date): boolean {
    return this.statusAt(now) === 'active';
  }

  /**
   * Takes the rule back.
   *
   * Returns the **same** instance when it was already revoked, which is what makes revoking twice
   * one act: the caller compares, and writes and records only when something changed.
   */
  revoke(at: Date): PermissionRule {
    if (this.revokedAt !== null) {
      return this;
    }

    return PermissionRule.restore({ ...this.snapshot(), revokedAt: at });
  }

  /**
   * Whether two rules grant the same thing: same person, scope, place, pattern and decision.
   *
   * It is what makes granting the same rule twice return the one that exists instead of a second
   * row that the list would show as a duplicate and a revocation would only half remove.
   */
  isEquivalentTo(other: PermissionRule): boolean {
    return (
      this.userId.equals(other.userId) &&
      this.scope === other.scope &&
      sameSession(this.sessionId, other.sessionId) &&
      this.projectPath === other.projectPath &&
      this.ruleContent === other.ruleContent &&
      this.decision === other.decision
    );
  }

  /**
   * Whether this rule answers that invocation, for that person, in that place, at that moment.
   *
   * A pure rule with no I/O — which is what lets it be tested by boundary, and what the UI reads
   * to tell somebody how far a rule they are about to grant would reach.
   */
  matches(
    subject: RuleSubject,
    toolName: string,
    input: Readonly<Record<string, unknown>>,
    now: Date,
  ): boolean {
    return (
      this.userId.equals(subject.userId) &&
      this.isActiveAt(now) &&
      this.reaches(subject) &&
      ruleMatches(this.pattern, toolName, input)
    );
  }

  snapshot(): PermissionRuleSnapshot {
    return {
      id: this.id,
      userId: this.userId,
      sessionId: this.sessionId,
      projectPath: this.projectPath,
      pattern: this.ruleContent,
      decision: this.decision,
      scope: this.scope,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt,
      revokedAt: this.revokedAt,
    };
  }

  /** Whether the scope covers the place the request comes from. */
  private reaches(subject: RuleSubject): boolean {
    switch (this.scope) {
      case 'session':
        return sameSession(this.sessionId, subject.sessionId);
      case 'project':
        return subject.projectPath !== null && this.projectPath === subject.projectPath;
      case 'always':
        return true;
    }
  }
}

/** Whether a draft names exactly the place its scope needs, and nothing more. */
function placedWhereItsScopeSays(draft: PermissionRuleDraft): boolean {
  switch (draft.scope) {
    case 'session':
      return draft.sessionId !== null && draft.projectPath === null;
    case 'project':
      return draft.sessionId === null && draft.projectPath !== null && draft.projectPath !== '';
    case 'always':
      return draft.sessionId === null && draft.projectPath === null;
  }
}

function sameSession(left: SessionId | null, right: SessionId | null): boolean {
  return left === null || right === null ? left === right : left.equals(right);
}
