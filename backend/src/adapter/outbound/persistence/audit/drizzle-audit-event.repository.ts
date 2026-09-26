import { Inject, Injectable } from '@nestjs/common';

import type { AuditEventRepository } from '@application/audit';
import type { AuditEvent } from '@domain/audit';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { auditEvents } from '@infra/database/schema';
import { runLogged } from '../query-logging';
import { toRow } from './audit-event.mapper';

/**
 * `audit_events`, in PostgreSQL.
 *
 * One method, and the absence of the others is the design: the table's trigger aborts `UPDATE`
 * always and `DELETE` inside the ninety-day floor, so anything else here would be an operation
 * that cannot succeed.
 */
@Injectable()
export class DrizzleAuditEventRepository implements AuditEventRepository {
  constructor(@Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext) {}

  async append(event: AuditEvent): Promise<void> {
    await runLogged(
      this.context.logger,
      'audit.appendEvent',
      this.context.db.insert(auditEvents).values(toRow(event)),
    );
  }
}
