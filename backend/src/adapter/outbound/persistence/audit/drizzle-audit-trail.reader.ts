import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type {
  AuditTrailPage,
  AuditTrailPageRequest,
  AuditTrailReader,
  SessionTrailOwnership,
} from '@application/audit';
import type { UserId } from '@domain/auth';
import type { SessionId } from '@domain/session';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { auditEntries } from '@infra/database/schema';
import { runLogged } from '../query-logging';
import { toEntity } from './audit-entry.mapper';

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

    const kept = rows.slice(0, request.limit);
    const last = kept.at(-1);

    return {
      records: kept.map((row) => ({ seq: row.seq, entry: toEntity(row), traceId: row.traceId })),
      nextCursor: rows.length > request.limit && last !== undefined ? last.seq : null,
    };
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
    request.sessionId === null ? null : eq(auditEntries.sessionId, request.sessionId.value),
    request.toolName === null ? null : eq(auditEntries.toolName, request.toolName),
    request.decision === null ? null : eq(auditEntries.decision, request.decision),
    request.from === null ? null : gte(auditEntries.at, request.from),
    request.to === null ? null : lt(auditEntries.at, request.to),
    request.before === null ? null : lt(auditEntries.seq, request.before),
  ];

  return conditions.filter((condition): condition is SQL => condition !== null);
}
