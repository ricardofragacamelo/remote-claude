import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lt, max, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type {
  AuditTrailPage,
  AuditTrailPageRequest,
  AuditTrailReader,
  DecidedInvocation,
  RuleUsage,
  SessionTrailOwnership,
} from '@application/audit';
import type { UserId } from '@domain/auth';
import type { SessionId } from '@domain/session';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { auditEntries, sessionOrigins } from '@infra/database/schema';
import { runLogged, whenPresent } from '../query-logging';
import { toEntity } from './audit-entry.mapper';
import { keysetPage } from './keyset-page';

/** The entries a permission rule could ever have answered — never the hook's own `recorded`. */
const DECISIONS = ['allowed', 'denied'] as const;

/**
 * `audit_entries`, read — by the query of the trail, and by nothing else.
 *
 * **Keyset, descending, over `seq`.** Never an offset, which repeats and skips rows on a table that
 * grows while somebody reads it, and never `at`, which ties within a millisecond and moves when a
 * clock is set back ([D-06](../../../../../../docs/plans/03-rules-and-audit/decisions.md)). `at`
 * is a filter, half-open: `from` included, `to` excluded.
 *
 * The shape of every query is the shape of an index. Scoped by user, it walks
 * `(user_id, seq DESC)`; scoped by session too, the planner has `(session_id, seq DESC)`; the
 * remaining filters are checked on the rows the index hands over, which it hands over already in
 * order — so a page stops after `limit + 1` of them rather than sorting the trail (S-28).
 */
@Injectable()
export class DrizzleAuditTrailReader implements AuditTrailReader {
  constructor(@Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext) {}

  async page(request: AuditTrailPageRequest): Promise<AuditTrailPage> {
    // One row past the page, to know whether there is another without a second query — and without
    // the page that has exactly `limit` rows left pointing at an empty one after it (S-71).
    const rows = await runLogged(
      this.context.logger,
      'audit.page',
      this.context.db
        .select()
        .from(auditEntries)
        .where(and(...conditionsOf(request)))
        .orderBy(desc(auditEntries.seq))
        .limit(request.limit + 1),
    );

    return keysetPage(rows, request.limit, (row) => ({
      seq: row.seq,
      entry: toEntity(row),
      traceId: row.traceId,
    }));
  }

  /**
   * Two lookups of one row each, both on `(session_id, seq DESC)`: is any entry of it mine, and
   * failing that, is there any entry at all.
   */
  async ownershipOf(sessionId: SessionId, userId: UserId): Promise<SessionTrailOwnership> {
    if (await this.any('audit.ownership.mine', eq(auditEntries.userId, userId.value), sessionId)) {
      return 'mine';
    }

    return (await this.any('audit.ownership.any', undefined, sessionId)) ? 'others' : 'none';
  }

  /**
   * One grouped query over the partial index `(user_id, rule_id, seq DESC) WHERE rule_id IS NOT
   * NULL` (plan 15, B-07's migration) — the trail's decision entries alone, never scanned row by
   * row even for a thousand rules at once (S-64).
   */
  async usageOf(
    userId: UserId,
    ruleIds: readonly string[],
    windowStart: Date,
  ): Promise<ReadonlyMap<string, RuleUsage>> {
    if (ruleIds.length === 0) {
      return new Map();
    }

    const rows = await runLogged(
      this.context.logger,
      'audit.ruleUsage',
      this.context.db
        .select({
          ruleId: auditEntries.ruleId,
          count: sql<number>`count(*)::int`,
          lastUsedAt: max(auditEntries.at),
        })
        .from(auditEntries)
        .where(
          and(
            eq(auditEntries.userId, userId.value),
            inArray(auditEntries.ruleId, [...ruleIds]),
            gte(auditEntries.at, windowStart),
          ),
        )
        .groupBy(auditEntries.ruleId),
    );

    return new Map(
      rows
        .filter((row): row is typeof row & { ruleId: string } => row.ruleId !== null)
        .map((row) => [row.ruleId, { count: row.count, lastUsedAt: row.lastUsedAt }]),
    );
  }

  /**
   * The entries, then the folders — two reads, never a join: `session_origins` is `session`'s
   * table, and the second query only runs over the sessions the first page actually named
   * ([15 · B-16], D-15).
   */
  async decided(userId: UserId, limit: number): Promise<readonly DecidedInvocation[]> {
    const rows = await runLogged(
      this.context.logger,
      'audit.decided',
      this.context.db
        .select()
        .from(auditEntries)
        .where(
          and(eq(auditEntries.userId, userId.value), inArray(auditEntries.decision, DECISIONS)),
        )
        .orderBy(desc(auditEntries.seq))
        .limit(limit),
    );

    const folders = await this.foldersOf([...new Set(rows.map((row) => row.sessionId))]);

    return rows.map((row) => ({
      record: { seq: row.seq, entry: toEntity(row), traceId: row.traceId },
      folder: folders.get(row.sessionId) ?? null,
    }));
  }

  private async foldersOf(sessionIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (sessionIds.length === 0) {
      return new Map();
    }

    const rows = await runLogged(
      this.context.logger,
      'audit.decided.folders',
      this.context.db
        .selectDistinctOn([sessionOrigins.sessionId], {
          sessionId: sessionOrigins.sessionId,
          workspacePath: sessionOrigins.workspacePath,
        })
        .from(sessionOrigins)
        .where(inArray(sessionOrigins.sessionId, [...sessionIds])),
    );

    return new Map(rows.map((row) => [row.sessionId, row.workspacePath]));
  }

  private async any(
    op: string,
    condition: SQL | undefined,
    sessionId: SessionId,
  ): Promise<boolean> {
    const rows = await runLogged(
      this.context.logger,
      op,
      this.context.db
        .select({ id: auditEntries.id })
        .from(auditEntries)
        .where(and(eq(auditEntries.sessionId, sessionId.value), condition))
        .limit(1),
    );

    return rows.length > 0;
  }
}

/** The `WHERE` of a page: the owner always, and each filter only when it was asked for. */
function conditionsOf(request: AuditTrailPageRequest): SQL[] {
  const conditions: (SQL | null)[] = [
    eq(auditEntries.userId, request.userId.value),
    whenPresent(request.sessionId, (sessionId) => eq(auditEntries.sessionId, sessionId.value)),
    whenPresent(request.toolName, (toolName) => eq(auditEntries.toolName, toolName)),
    whenPresent(request.kind, (kind) => eq(auditEntries.toolKind, kind)),
    whenPresent(request.decision, (decision) => eq(auditEntries.decision, decision)),
    whenPresent(request.from, (from) => gte(auditEntries.at, from)),
    whenPresent(request.to, (to) => lt(auditEntries.at, to)),
    whenPresent(request.before, (before) => lt(auditEntries.seq, before)),
    whenPresent(request.ruleId, (ruleId) => eq(auditEntries.ruleId, ruleId)),
  ];

  return conditions.filter((condition): condition is SQL => condition !== null);
}
