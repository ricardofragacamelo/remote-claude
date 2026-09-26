import type { UserId } from '@domain/auth';
import type { PermissionRule } from '@domain/permission';

/** What granting did: the rule that now stands, and whether this call is what made it. */
export interface RuleGrant {
  readonly rule: PermissionRule;

  /** `false` when an equivalent rule was already active, and that one came back instead. */
  readonly created: boolean;
}

/** What writing a revocation did: the rule as it is now stored, and whether this call revoked it. */
export interface RuleRevocation {
  /** The revocation the store keeps — this call's when it was first, the earlier one otherwise. */
  readonly rule: PermissionRule;

  /** `false` when another revocation got there first, and this one wrote nothing. */
  readonly revoked: boolean;
}

/**
 * The rules that outlive a session — `project` and `always` — in whatever stores them.
 *
 * A `session` rule never reaches this port: it lives in the registry and dies with the subprocess,
 * which is what a session rule means. What comes here is what has to survive the process.
 *
 * There is no `delete`. A revoked rule is written as revoked and kept, because the trail points at
 * it — "which rule let this run?" has to have an answer even after somebody took the rule back.
 */
export interface PermissionRuleRepository {
  /**
   * Stores the rule, unless an equivalent one is already active — then that one comes back.
   *
   * **Atomic**, and that is the point of it being one method rather than a find and a save: two
   * clients granting the same rule at the same moment must end up with one row, not two.
   */
  grant(rule: PermissionRule, now: Date): Promise<RuleGrant>;

  /** The rule with that id, whoever owns it and whatever its state, or `null`. */
  findById(ruleId: string): Promise<PermissionRule | null>;

  /**
   * The rules of this person that could answer a request right now: active, not revoked, and
   * either `always` or `project` for that workspace root.
   *
   * The pattern is **not** matched here. That is the domain's job, and a query that pre-filtered
   * by pattern would be a second, untested implementation of the matcher.
   */
  findApplicable(userId: UserId, projectPath: string | null, now: Date): Promise<PermissionRule[]>;

  /** This person's rules that have not been revoked, newest first — expired ones included. */
  listFor(userId: UserId): Promise<PermissionRule[]>;

  /**
   * Writes a revocation, unless the rule is already revoked. Only ever called with a rule the
   * domain has just revoked.
   *
   * **Atomic**, for the same reason as {@link grant}: two clients revoking at the same moment both
   * read the rule as active, and only one of them may be the revocation — the one whose instant
   * the row keeps, and the one the trail records (S-46).
   */
  saveRevocation(rule: PermissionRule): Promise<RuleRevocation>;
}

export const PERMISSION_RULE_REPOSITORY = Symbol('PermissionRuleRepository');
