import type { PermissionRuleRepository, RuleGrant, RuleRevocation } from '@application/permission';
import type { PermissionRule } from '@domain/permission';
import type { UserId } from '@domain/auth';

/**
 * The persisted rules, in a list — the same contract as the table, without the database.
 *
 * It honours the two properties the use cases lean on: granting an equivalent active rule hands
 * back the one that exists, and a revocation is written, never a deletion. The SQL that makes
 * those true under concurrency is proved against PostgreSQL in the integration suite.
 */
export class InMemoryPermissionRuleRepository implements PermissionRuleRepository {
  readonly rules: PermissionRule[] = [];

  /** When set, every read that answers a request rejects with it. */
  lookupFailure: Error | null = null;

  grant(rule: PermissionRule, now: Date): Promise<RuleGrant> {
    const existing = this.rules.find(
      (stored) => stored.isActiveAt(now) && stored.isEquivalentTo(rule),
    );

    if (existing !== undefined) {
      return Promise.resolve({ rule: existing, created: false });
    }

    this.rules.push(rule);
    return Promise.resolve({ rule, created: true });
  }

  findById(ruleId: string): Promise<PermissionRule | null> {
    return Promise.resolve(this.rules.find((rule) => rule.id === ruleId) ?? null);
  }

  findApplicable(userId: UserId, projectPath: string | null, now: Date): Promise<PermissionRule[]> {
    if (this.lookupFailure !== null) {
      return Promise.reject(this.lookupFailure);
    }

    return Promise.resolve(
      this.rules.filter(
        (rule) =>
          rule.userId.equals(userId) &&
          rule.isActiveAt(now) &&
          (rule.scope === 'always' ||
            (rule.scope === 'project' && projectPath !== null && rule.projectPath === projectPath)),
      ),
    );
  }

  listFor(userId: UserId): Promise<PermissionRule[]> {
    return Promise.resolve(
      this.rules.filter((rule) => rule.userId.equals(userId) && rule.revokedAt === null).reverse(),
    );
  }

  saveRevocation(rule: PermissionRule): Promise<RuleRevocation> {
    const index = this.rules.findIndex((stored) => stored.id === rule.id);
    const stored = this.rules[index];

    // The first revocation is the one kept, as the table's predicate keeps it.
    if (stored === undefined || stored.revokedAt !== null) {
      return Promise.resolve({ rule: stored ?? rule, revoked: false });
    }

    this.rules[index] = rule;
    return Promise.resolve({ rule, revoked: true });
  }
}
