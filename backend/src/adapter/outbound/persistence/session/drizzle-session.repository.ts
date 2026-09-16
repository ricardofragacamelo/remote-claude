import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { SessionRepository } from '@application/session';
import { CLOCK } from '@application/shared';
import type { Clock } from '@domain/shared';
import type { Session, SessionId } from '@domain/session';
import { DATABASE } from '@infra/database/database.tokens';
import type { Database } from '@infra/database/connection';
import { sessions } from '@infra/database/schema';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { runLogged } from '../query-logging';
import { toEntity, toRow } from './session.mapper';

/**
 * `sessions`, in PostgreSQL.
 *
 * The technology is in the name on purpose: reading it tells you what breaks the day the storage
 * changes. It answers entities and holds no business rule — it fetches and it writes.
 */
@Injectable()
export class DrizzleSessionRepository implements SessionRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async findById(id: SessionId): Promise<Session | null> {
    const rows = await runLogged(
      this.logger,
      'session.findById',
      this.db.select().from(sessions).where(eq(sessions.id, id.value)).limit(1),
    );

    const row = rows[0];
    return row === undefined ? null : toEntity(row);
  }

  async save(session: Session): Promise<void> {
    const row = toRow(session, this.clock.now());

    await runLogged(
      this.logger,
      'session.save',
      this.db
        .insert(sessions)
        .values(row)
        .onConflictDoUpdate({
          target: sessions.id,
          set: {
            lastPingedAt: row.lastPingedAt,
            pingCount: row.pingCount,
            updatedAt: row.updatedAt,
          },
        }),
    );
  }
}
