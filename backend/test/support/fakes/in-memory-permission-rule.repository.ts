import { encodeRuleCursor } from '@application/permission';
import type {
  PermissionRuleCursor,
  PermissionRuleListFilter,
  PermissionRuleListPage,
  PermissionRuleListRequest,
  PermissionRuleRepository,
  PermissionRuleSortField,
  PermissionRuleSortOrder,
  PermissionRuleSummary,
  RuleExpiryChange,
  RuleGrant,
  RuleRevocation,
} from '@application/permission';
import { PermissionRule, projectPathReaches } from '@domain/permission';
import type { PermissionRuleStatus } from '@domain/permission';
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
            (rule.scope === 'project' &&
              projectPath !== null &&
              rule.projectPath !== null &&
              projectPathReaches(rule.projectPath, projectPath))),
      ),
    );
  }

  listFor(userId: UserId): Promise<PermissionRule[]> {
    return Promise.resolve(
      this.rules.filter((rule) => rule.userId.equals(userId) && rule.revokedAt === null).reverse(),
    );
  }

  listPage(request: PermissionRuleListRequest): Promise<PermissionRuleListPage> {
    const matching = this.matching(request.userId, request.filter, request.now);
    const sorted = sortedBy(matching, request.sort, request.order);
    const afterCursor =
      request.cursor === null
        ? sorted
        : sorted.filter((rule) => isPastCursor(rule, request.cursor as PermissionRuleCursor));
    const kept = afterCursor.slice(0, request.pageSize);
    const last = kept.at(-1);
    const hasMore = afterCursor.length > request.pageSize && last !== undefined;

    return Promise.resolve({
      items: kept,
      nextCursor: hasMore
        ? encodeRuleCursor({
            sort: request.sort,
            order: request.order,
            value: valueOf(last, request.sort),
            grantedAt: last.createdAt.toISOString(),
            id: last.id,
          })
        : null,
    });
  }

  listAllMatching(userId: UserId, filter: PermissionRuleListFilter): Promise<PermissionRule[]> {
    return Promise.resolve(
      sortedBy(this.matching(userId, filter, new Date()), 'grantedAt', 'desc'),
    );
  }

  summarize(
    userId: UserId,
    filter: PermissionRuleListFilter,
    now: Date,
  ): Promise<PermissionRuleSummary> {
    const scoped = this.rules.filter(
      (rule) =>
        rule.userId.equals(userId) &&
        (filter.scope === null || rule.scope === filter.scope) &&
        (filter.decision === null || rule.decision === filter.decision) &&
        (filter.engine === null || rule.engine === filter.engine),
    );

    const byStatus: Record<PermissionRuleStatus, number> = {
      active: 0,
      expired: 0,
      revoked: 0,
      disabled: 0,
    };
    let allow = 0;
    let deny = 0;
    let project = 0;
    let always = 0;
    let expiringBefore = 0;

    for (const rule of scoped) {
      const status = rule.statusAt(now);
      byStatus[status] += 1;

      // `byDecision`/`byScope`/`expiringBefore` read the same default set the listing shows
      // without a `status` filter — active and expired — never a revoked or disabled rule mixed
      // into "how many allow vs deny" (same predicate as the listing, [15 · B-10]).
      if (status !== 'active' && status !== 'expired') {
        continue;
      }

      if (rule.decision === 'allow') allow += 1;
      else deny += 1;
      if (rule.scope === 'project') project += 1;
      else if (rule.scope === 'always') always += 1;
      if (
        filter.expiresBefore !== null &&
        status === 'active' &&
        rule.expiresAt.getTime() < filter.expiresBefore.getTime()
      ) {
        expiringBefore += 1;
      }
    }

    return Promise.resolve({
      byStatus,
      byDecision: { allow, deny },
      byScope: { project, always },
      expiringBefore,
    });
  }

  /** The rules of [userId] matching [filter] — the default status set when none is named. */
  private matching(userId: UserId, filter: PermissionRuleListFilter, now: Date): PermissionRule[] {
    const statuses: readonly PermissionRuleStatus[] =
      filter.status.length === 0 ? ['active', 'expired'] : filter.status;
    const q = filter.q === null ? null : filter.q.toLowerCase();

    return this.rules.filter(
      (rule) => rule.userId.equals(userId) && matchesFilter(rule, filter, statuses, q, now),
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

  async saveRevocations(ruleIds: readonly string[], at: Date): Promise<RuleRevocation[]> {
    const results: RuleRevocation[] = [];

    for (const ruleId of ruleIds) {
      const index = this.rules.findIndex((stored) => stored.id === ruleId);
      const stored = this.rules[index];

      if (stored === undefined) {
        continue;
      }

      if (stored.revokedAt !== null) {
        results.push({ rule: stored, revoked: false });
        continue;
      }

      const { rule: revoked } = await this.saveRevocation(stored.revoke(at));
      results.push({ rule: revoked, revoked: true });
    }

    return results;
  }

  changeExpiry(
    ruleId: string,
    expectedExpiresAt: Date,
    newExpiresAt: Date,
  ): Promise<RuleExpiryChange> {
    const index = this.rules.findIndex((stored) => stored.id === ruleId);
    const stored = this.rules[index];

    if (stored === undefined) {
      throw new Error(`changeExpiry called with an id this fake never granted: ${ruleId}`);
    }

    if (stored.revokedAt !== null || stored.expiresAt.getTime() !== expectedExpiresAt.getTime()) {
      return Promise.resolve({ rule: stored, changed: false });
    }

    // Writes directly, the same as the production repository: validation already ran in the
    // domain/use case layer, and a repository's job is to persist, not to validate again.
    const updated = PermissionRule.restore({ ...stored.snapshot(), expiresAt: newExpiresAt });
    this.rules[index] = updated;
    return Promise.resolve({ rule: updated, changed: true });
  }
}

/** [rule]'s value for [sort] — mirrors the production repository's own `valueOf`. */
function valueOf(rule: PermissionRule, sort: PermissionRuleSortField): string | number {
  switch (sort) {
    case 'grantedAt':
      return rule.createdAt.toISOString();
    case 'expiresAt':
      return rule.expiresAt.toISOString();
    case 'pattern':
      return rule.ruleContent;
    case 'lastUsedAt':
    case 'useCount':
      // Usage-sorted pages never reach this fake directly: `listAllMatching` is unsorted by usage,
      // and the use case under test sorts in memory from there — see its own spec.
      return 0;
  }
}

function sortedBy(
  rules: readonly PermissionRule[],
  sort: PermissionRuleSortField,
  order: PermissionRuleSortOrder,
): PermissionRule[] {
  const direction = order === 'asc' ? 1 : -1;

  return [...rules].sort((a, b) => {
    const left = valueOf(a, sort);
    const right = valueOf(b, sort);
    const primary = left < right ? -1 : left > right ? 1 : 0;
    // `(grantedAt, id)` breaks every tie, same order as the sort itself.
    const tiebreak =
      primary !== 0
        ? primary
        : a.createdAt.getTime() !== b.createdAt.getTime()
          ? a.createdAt.getTime() - b.createdAt.getTime()
          : a.id < b.id
            ? -1
            : a.id > b.id
              ? 1
              : 0;

    return tiebreak * direction;
  });
}

function isPastCursor(rule: PermissionRule, cursor: PermissionRuleCursor): boolean {
  const value = valueOf(rule, cursor.sort);
  const key = [value, rule.createdAt.toISOString(), rule.id] as const;
  const boundary = [cursor.value, cursor.grantedAt, cursor.id] as const;
  const comparison = compareTuples(key, boundary);

  return cursor.order === 'asc' ? comparison > 0 : comparison < 0;
}

function compareTuples(
  a: readonly [string | number, string, string],
  b: readonly [string | number | null, string, string],
): number {
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] as string | number;
    const right = b[index] as string | number;

    if (left < right) return -1;
    if (left > right) return 1;
  }

  return 0;
}

function matchesFilter(
  rule: PermissionRule,
  filter: PermissionRuleListFilter,
  statuses: readonly PermissionRuleStatus[],
  q: string | null,
  now: Date,
): boolean {
  return (
    statuses.includes(rule.statusAt(now)) && matchesFields(rule, filter) && matchesQuery(rule, q)
  );
}

/** Every exact-match field of [filter] against [rule] — `null` in the filter matches anything. */
function matchesFields(rule: PermissionRule, filter: PermissionRuleListFilter): boolean {
  const pairs: readonly [unknown, unknown][] = [
    [filter.scope, rule.scope],
    [filter.decision, rule.decision],
    [filter.engine, rule.engine],
    [filter.kind, rule.ruleContent.split('(')[0]],
    [filter.folder, rule.projectPath],
  ];

  return pairs.every(([wanted, actual]) => wanted === null || wanted === actual);
}

function matchesQuery(rule: PermissionRule, q: string | null): boolean {
  return (
    q === null ||
    rule.ruleContent.toLowerCase().includes(q) ||
    (rule.projectPath?.toLowerCase().includes(q) ?? false)
  );
}
