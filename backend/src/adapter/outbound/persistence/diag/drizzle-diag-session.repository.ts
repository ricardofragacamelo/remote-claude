import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { DiagSessionRepository } from '@application/diag';
import type { DiagSession } from '@domain/diag';
import type { SessionId } from '@domain/session';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { diagSessions } from '@infra/database/schema';
import { runLogged } from '../query-logging';
import { toEntity, toRow } from './diag-session.mapper';

/**
 * `diag_sessions`, in PostgreSQL.
 *
 * The technology is in the name on purpose: reading it tells you what breaks the day the storage
 * changes. It answers entities and holds no business rule — it fetches and it writes.
 */
@Injectable()
export class DrizzleDiagSessionRepository implements DiagSessionRepository {
  constructor(@Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext) {}

  async findById(id: SessionId): Promise<DiagSession | null> {
    const rows = await runLogged(
      this.context.logger,
      'diag.findById',
      this.context.db.select().from(diagSessions).where(eq(diagSessions.id, id.value)).limit(1),
    );

    const row = rows[0];
    return row === undefined ? null : toEntity(row);
  }

  async save(session: DiagSession): Promise<void> {
    const row = toRow(session, this.context.clock.now());

    await runLogged(
      this.context.logger,
      'diag.save',
      this.context.db
        .insert(diagSessions)
        .values(row)
        .onConflictDoUpdate({
          target: diagSessions.id,
          set: {
            lastPingedAt: row.lastPingedAt,
            pingCount: row.pingCount,
            updatedAt: row.updatedAt,
          },
        }),
    );
  }
}
