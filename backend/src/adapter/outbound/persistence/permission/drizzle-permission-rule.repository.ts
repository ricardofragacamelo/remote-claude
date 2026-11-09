import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { Column, SQL } from 'drizzle-orm';

import { encodeRuleCursor } from '@application/permission';
import type {
  PermissionRuleCursor,
  PermissionRuleListFilter,
  PermissionRuleListPage,
  PermissionRuleListRequest,
  PermissionRuleRepository,
  PermissionRuleSummary,
  RuleExpiryChange,
  RuleGrant,
  RuleRevocation,
} from '@application/permission';
import type { PermissionRule } from '@domain/permission';
import type { UserId } from '@domain/auth';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { permissionRules } from '@infra/database/schema';
import { describedBy, runLogged, whenPresent } from '../query-logging';
import { filterConditions, statusCondition } from './permission-rule-query';
import { toEntity, toRow } from './permission-rule.mapper';

/**
 * `permission_rules`, in PostgreSQL.
 *
 * Every read that can answer a request is scoped by user and by the clock, in the predicate: a
 * lookup that could be written without the owner is the one that lets one person's rule answer
 * another's request (D-03), and one without `expires_at` is the one that lets an expired rule go
 * on answering.
 */
@Injectable()
export class DrizzlePermissionRuleRepository implements PermissionRuleRepository {
  constructor(@Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext) {}

  /**
   * One transaction, behind an advisory lock keyed on what makes two rules the same.
   *
   * A unique index cannot say "one **active** rule": whether a row is active depends on the
   * clock, and an index cannot read it. The lock is transaction-scoped, so it is released by the
   * commit or the rollback and never outlives the grant — and two clients granting the same rule
   * at the same moment end up with one row, because the second one reads the first one's.
   */
  async grant(rule: PermissionRule, now: Date): Promise<RuleGrant> {
    // JSON rather than a separator: no character is safe to join on when one of the parts is a
    // command line somebody typed, and PostgreSQL text refuses the NUL that would otherwise be.
    const key = JSON.stringify([
      rule.userId.value,
      rule.scope,
      rule.projectPath,
      rule.ruleContent,
      rule.engine,
      rule.decision,
    ]);

    return this.context.db.transaction(async (tx) => {
      await runLogged(
        this.context.logger,
        'permissionRule.lock',
        describedBy(tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`)),
      );

      const existing = await runLogged(
        this.context.logger,
        'permissionRule.findEquivalent',
        tx
          .select()
          .from(permissionRules)
          .where(
            and(
              eq(permissionRules.userId, rule.userId.value),
              eq(permissionRules.scope, rule.scope),
              rule.projectPath === null
                ? isNull(permissionRules.projectPath)
                : eq(permissionRules.projectPath, rule.projectPath),
              eq(permissionRules.pattern, rule.ruleContent),
              rule.engine === null
                ? isNull(permissionRules.engine)
                : eq(permissionRules.engine, rule.engine),
              eq(permissionRules.decision, rule.decision),
              ...answering(),
              gt(permissionRules.expiresAt, now),
            ),
          )
          .limit(1),
      );

      const found = existing[0];
      if (found !== undefined) {
        return { rule: toEntity(found), created: false };
      }

      await runLogged(
        this.context.logger,
        'permissionRule.insert',
        tx.insert(permissionRules).values(toRow(rule, now)),
      );

      return { rule, created: true };
    });
  }

  /** By id alone, and on purpose: telling "not there" from "not yours" is the caller's job. */
  async findById(ruleId: string): Promise<PermissionRule | null> {
    const [row] = await runLogged(
      this.context.logger,
      'permissionRule.findById',
      this.context.db.select().from(permissionRules).where(eq(permissionRules.id, ruleId)).limit(1),
    );

    return row === undefined ? null : toEntity(row);
  }

  async findApplicable(
    userId: UserId,
    projectPath: string | null,
    now: Date,
  ): Promise<PermissionRule[]> {
    // `always` reaches every request; `project` reaches its folder and every folder inside it, at a
    // `/` boundary (plan 15, D-10) — `starts_with` is a literal comparison, so a folder name that
    // happens to hold `%` or `_` is never misread as a wildcard. A request with no known project is
    // reached by `always` alone.
    const reach: SQL | undefined =
      projectPath === null
        ? eq(permissionRules.scope, 'always')
        : or(
            eq(permissionRules.scope, 'always'),
            and(
              eq(permissionRules.scope, 'project'),
              or(
                eq(permissionRules.projectPath, projectPath),
                sql`starts_with(${projectPath}, ${permissionRules.projectPath} || '/')`,
              ),
            ),
          );

    const rows = await runLogged(
      this.context.logger,
      'permissionRule.findApplicable',
      this.context.db
        .select()
        .from(permissionRules)
        .where(
          and(
            eq(permissionRules.userId, userId.value),
            inArray(permissionRules.scope, ['project', 'always']),
            ...answering(),
            gt(permissionRules.expiresAt, now),
            reach,
          ),
        )
        .orderBy(desc(permissionRules.grantedAt)),
    );

    return rows.map(toEntity);
  }

  async listFor(userId: UserId): Promise<PermissionRule[]> {
    return this.selectByGrantedAt(
      'permissionRule.listFor',
      and(eq(permissionRules.userId, userId.value), isNull(permissionRules.revokedAt))!,
    );
  }

  async listPage(request: PermissionRuleListRequest): Promise<PermissionRuleListPage> {
    assertSortable(request.sort);
    const column = sortColumnOf(request.sort);
    const direction = request.order === 'asc' ? asc : desc;
    const conditions = [...filterConditions(request.userId, request.filter, request.now)];

    if (request.cursor !== null) {
      const boundary = cursorBoundaryOf(request.cursor);
      conditions.push(
        request.order === 'asc'
          ? sql`(${column}, ${permissionRules.grantedAt}, ${permissionRules.id}) > ${boundary}`
          : sql`(${column}, ${permissionRules.grantedAt}, ${permissionRules.id}) < ${boundary}`,
      );
    }

    // One row past the page says whether there is another, without a second query (plan 03's
    // trail pages the same way).
    const rows = await runLogged(
      this.context.logger,
      'permissionRule.listPage',
      this.context.db
        .select()
        .from(permissionRules)
        .where(and(...conditions))
        .orderBy(
          direction(column),
          direction(permissionRules.grantedAt),
          direction(permissionRules.id),
        )
        .limit(request.pageSize + 1),
    );

    const kept = rows.slice(0, request.pageSize);
    const last = kept.at(-1);
    const hasMore = rows.length > request.pageSize && last !== undefined;

    return {
      items: kept.map(toEntity),
      nextCursor: hasMore
        ? encodeRuleCursor({
            sort: request.sort,
            order: request.order,
            value: valueOf(request.sort, last),
            grantedAt: last.grantedAt.toISOString(),
            id: last.id,
          })
        : null,
    };
  }

  async listAllMatching(
    userId: UserId,
    filter: PermissionRuleListFilter,
  ): Promise<PermissionRule[]> {
    return this.selectByGrantedAt(
      'permissionRule.listAllMatching',
      and(...filterConditions(userId, filter, new Date()))!,
    );
  }

  /** `SELECT … WHERE [condition] ORDER BY granted_at DESC, id DESC` — what `listFor`/`listAllMatching` share. */
  private async selectByGrantedAt(op: string, condition: SQL): Promise<PermissionRule[]> {
    const rows = await runLogged(
      this.context.logger,
      op,
      this.context.db
        .select()
        .from(permissionRules)
        .where(condition)
        .orderBy(desc(permissionRules.grantedAt), desc(permissionRules.id)),
    );

    return rows.map(toEntity);
  }

  async summarize(
    userId: UserId,
    filter: PermissionRuleListFilter,
    now: Date,
  ): Promise<PermissionRuleSummary> {
    const [row] = await runLogged(
      this.context.logger,
      'permissionRule.summarize',
      this.context.db
        .select(summaryCounts(filter, now))
        .from(permissionRules)
        .where(summaryScope(userId, filter)),
    );

    // An unfiltered count(*) aggregate always returns exactly one row — never none to fall back on.
    return summaryOf(row!);
  }

  async saveRevocation(rule: PermissionRule): Promise<RuleRevocation> {
    // `revoked_at IS NULL` in the predicate: the first revocation is the one the row keeps, and a
    // second writer racing it changes nothing. PostgreSQL re-reads the predicate on the row the
    // first writer committed, so the loser matches no row — and reads back what the winner wrote.
    const [won] = await runLogged(
      this.context.logger,
      'permissionRule.revoke',
      this.context.db
        .update(permissionRules)
        .set({ revokedAt: rule.revokedAt, updatedAt: this.context.clock.now() })
        .where(and(eq(permissionRules.id, rule.id), isNull(permissionRules.revokedAt)))
        .returning(),
    );

    if (won !== undefined) {
      return { rule: toEntity(won), revoked: true };
    }

    return { rule: (await this.findById(rule.id)) ?? rule, revoked: false };
  }

  async saveRevocations(ruleIds: readonly string[], at: Date): Promise<RuleRevocation[]> {
    if (ruleIds.length === 0) {
      return [];
    }

    // One `UPDATE`, the atomicity D-06 asks for: every id still not revoked is taken in the same
    // instruction, and an id that already was simply matches no row here.
    const won = await runLogged(
      this.context.logger,
      'permissionRule.revokeBatch',
      this.context.db
        .update(permissionRules)
        .set({ revokedAt: at, updatedAt: this.context.clock.now() })
        .where(and(inArray(permissionRules.id, ruleIds), isNull(permissionRules.revokedAt)))
        .returning(),
    );

    const revoked = new Map(won.map((row) => [row.id, toEntity(row)]));
    const results: RuleRevocation[] = [];

    for (const ruleId of ruleIds) {
      const rule = revoked.get(ruleId);

      if (rule !== undefined) {
        results.push({ rule, revoked: true });
        continue;
      }

      // Already revoked before this call reached the database — idempotent, not an error.
      results.push({ rule: (await this.findById(ruleId))!, revoked: false });
    }

    return results;
  }

  async changeExpiry(
    ruleId: string,
    expectedExpiresAt: Date,
    newExpiresAt: Date,
    clearReminder: boolean,
  ): Promise<RuleExpiryChange> {
    // `revokedAt IS NULL` and `expiresAt = [expectedExpiresAt]` in the predicate: only a row that
    // has moved neither way since the caller read it is touched, and the write itself is what
    // decides a race with a revocation or another `PATCH` — never an earlier read (S-74, S-75).
    const [won] = await runLogged(
      this.context.logger,
      'permissionRule.changeExpiry',
      this.context.db
        .update(permissionRules)
        .set({
          expiresAt: newExpiresAt,
          updatedAt: this.context.clock.now(),
          ...(clearReminder ? { expiryRemindedAt: null } : {}),
        })
        .where(
          and(
            eq(permissionRules.id, ruleId),
            isNull(permissionRules.revokedAt),
            eq(permissionRules.expiresAt, expectedExpiresAt),
          ),
        )
        .returning(),
    );

    if (won !== undefined) {
      return { rule: toEntity(won), changed: true };
    }

    return { rule: (await this.findById(ruleId))!, changed: false };
  }
}

/**
 * What a rule that may answer is, beside the clock: not revoked, in the canonical grammar, and not
 * switched off — a rule the migration has not read, or could not translate, answers nothing.
 */
function answering(): SQL[] {
  return [
    isNull(permissionRules.revokedAt),
    eq(permissionRules.grammar, 'canonical'),
    isNull(permissionRules.disabledReason),
  ];
}

type PermissionRuleRow = typeof permissionRules.$inferSelect;

/** The three sort fields the table itself holds — what `listPage` alone ever sorts by. */
type SortableField = Exclude<PermissionRuleListRequest['sort'], 'lastUsedAt' | 'useCount'>;

/**
 * Guards `listPage` against the two sorts only the usage-sorted path may ask for: `lastUsedAt` and
 * `useCount` live in the trail, not here. The use case that needs them reads every matching rule
 * with {@link PermissionRuleRepository.listAllMatching}, asks `AuditTrailReader` for their usage,
 * and sorts there (plan 15, B-10/B-11) — this repository never joins the trail it does not own.
 * Checked once, here, so `sortColumnOf`/`valueOf` stay exhaustive over the three columns alone.
 */
function assertSortable(sort: PermissionRuleListRequest['sort']): asserts sort is SortableField {
  if (sort === 'lastUsedAt' || sort === 'useCount') {
    throw new Error(
      `permissionRule.listPage does not sort by ${sort} — route through the usage-sorted path instead`,
    );
  }
}

/** The column the listing orders by. */
function sortColumnOf(sort: SortableField): Column {
  switch (sort) {
    case 'grantedAt':
      return permissionRules.grantedAt;
    case 'expiresAt':
      return permissionRules.expiresAt;
    case 'pattern':
      return permissionRules.pattern;
  }
}

/** The cursor's own value, cast the way the sort column it mirrors reads. */
function cursorBoundaryOf(cursor: PermissionRuleCursor): SQL {
  const value = cursor.sort === 'pattern' ? String(cursor.value) : new Date(String(cursor.value));

  return sql`(${value}, ${new Date(cursor.grantedAt)}, ${cursor.id})`;
}

/** What the next cursor's `value` holds, read off the last row kept. */
function valueOf(sort: SortableField, row: PermissionRuleRow): string {
  switch (sort) {
    case 'grantedAt':
      return row.grantedAt.toISOString();
    case 'expiresAt':
      return row.expiresAt.toISOString();
    case 'pattern':
      return row.pattern;
  }
}

/** `count(*)` over the rows matching [condition] alone — one query, several counts, no N+1. */
function countWhere(condition: SQL): SQL<number> {
  return sql<number>`count(*) filter (where ${condition})::int`;
}

/** The `WHERE` of `summarize` — the owner always, and the three top-level filters it shares with the listing. */
function summaryScope(userId: UserId, filter: PermissionRuleListFilter): SQL {
  return and(
    ...(
      [
        eq(permissionRules.userId, userId.value),
        whenPresent(filter.scope, (scope) => eq(permissionRules.scope, scope)),
        whenPresent(filter.decision, (decision) => eq(permissionRules.decision, decision)),
        whenPresent(filter.engine, (engine) => eq(permissionRules.engine, engine)),
      ] satisfies (SQL | null)[]
    ).filter((condition): condition is SQL => condition !== null),
  )!;
}

/** The row `summarize`'s query returns — every bucket `summaryCounts` names, always a number. */
type PermissionRuleCountsRow = { [K in keyof ReturnType<typeof summaryCounts>]: number };

/** [counted] — the raw row `summarize`'s query returns — read into the shape it reports. */
function summaryOf(counted: PermissionRuleCountsRow): PermissionRuleSummary {
  return {
    byStatus: {
      active: counted.active,
      expired: counted.expired,
      revoked: counted.revoked,
      disabled: counted.disabled,
    },
    byDecision: { allow: counted.allow, deny: counted.deny },
    byScope: { project: counted.project, always: counted.always },
    expiringBefore: counted.expiringBefore,
  };
}

/** The `count(*) filter (where …)` of every bucket `summarize` reports, in one `select`. */
function summaryCounts(filter: PermissionRuleListFilter, now: Date) {
  // `byDecision`/`byScope`/`expiringBefore` read the same default set the listing shows without a
  // `status` filter — active and expired — never a revoked or disabled rule mixed into "how many
  // allow vs deny" (same predicate as the listing, [15 · B-10]).
  const defaultStatus = or(statusCondition('active', now), statusCondition('expired', now))!;

  return {
    active: countWhere(statusCondition('active', now)),
    expired: countWhere(statusCondition('expired', now)),
    revoked: countWhere(statusCondition('revoked', now)),
    disabled: countWhere(statusCondition('disabled', now)),
    allow: countWhere(and(defaultStatus, eq(permissionRules.decision, 'allow'))!),
    deny: countWhere(and(defaultStatus, eq(permissionRules.decision, 'deny'))!),
    project: countWhere(and(defaultStatus, eq(permissionRules.scope, 'project'))!),
    always: countWhere(and(defaultStatus, eq(permissionRules.scope, 'always'))!),
    expiringBefore:
      whenPresent(filter.expiresBefore, (expiresBefore) =>
        countWhere(
          and(statusCondition('active', now), lt(permissionRules.expiresAt, expiresBefore))!,
        ),
      ) ?? sql<number>`0`,
  };
}
