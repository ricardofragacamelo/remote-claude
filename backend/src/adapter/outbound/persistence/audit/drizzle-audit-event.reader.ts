import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, like, lt } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { AuditEventPage, AuditEventPageRequest, AuditEventReader } from '@application/audit';
import { PERSISTENCE_CONTEXT, type PersistenceContext } from '@infra/database/persistence-context';
import { auditEvents } from '@infra/database/schema';
import { runLogged } from '../query-logging';
import { toEntity } from './audit-event.mapper';
import { keysetPage } from './keyset-page';

/**
 * `audit_events`, read — by the query of the account facts, and by nothing else.
 *
 * Keyset, descending over `seq`, on the `(user_id, seq DESC)` index the trail already has: never an
 * offset, which repeats and skips on a table that grows while somebody reads it, and never `at`,
 * which ties within a millisecond. The kind is filtered on the rows the index hands over.
 */
@Injectable()
export class DrizzleAuditEventReader implements AuditEventReader {
  constructor(@Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext) {}

  async page(request: AuditEventPageRequest): Promise<AuditEventPage> {
    // One row past the page, which `keysetPage` reads as "there is another".
    const rows = await runLogged(
      this.context.logger,
      'audit.eventsPage',
      this.context.db
        .select()
        .from(auditEvents)
        .where(and(...conditionsOf(request)))
        .orderBy(desc(auditEvents.seq))
        .limit(request.limit + 1),
    );

    return keysetPage(rows, request.limit, (row) => ({ seq: row.seq, event: toEntity(row) }));
  }
}

/**
 * The owner always; the kind and the cursor when asked. The prefix arrives as letters and dots
 * only — the DTO refuses anything else — so it carries no `%` or `_` of its own into the `LIKE`.
 */
function conditionsOf(request: AuditEventPageRequest): SQL[] {
  const conditions: (SQL | null)[] = [
    eq(auditEvents.userId, request.userId.value),
    request.kindPrefix === null ? null : like(auditEvents.kind, `${request.kindPrefix}%`),
    request.before === null ? null : lt(auditEvents.seq, request.before),
  ];

  return conditions.filter((condition): condition is SQL => condition !== null);
}
