import { UserId } from '@domain/auth';
import { Session, SessionId } from '@domain/session';
import type { sessions } from '@infra/database/schema';

type SessionRow = typeof sessions.$inferSelect;
type SessionInsert = typeof sessions.$inferInsert;

/**
 * Translation between the table and the entity.
 *
 * It looks like ceremony until the first time the column has to change without the rule changing,
 * or the other way round. See docs/architecture/backend/05-persistence.md.
 */
export function toEntity(row: SessionRow): Session {
  return Session.restore({
    id: SessionId.create(row.id),
    ownerId: UserId.create(row.ownerId),
    openedAt: row.openedAt,
    lastPingedAt: row.lastPingedAt,
    pingCount: row.pingCount,
  });
}

/** The row an entity should be written as. `updatedAt` is set here, never left to a trigger. */
export function toRow(session: Session, now: Date): SessionInsert {
  const snapshot = session.snapshot();

  return {
    id: snapshot.id.value,
    ownerId: snapshot.ownerId.value,
    openedAt: snapshot.openedAt,
    lastPingedAt: snapshot.lastPingedAt,
    pingCount: snapshot.pingCount,
    updatedAt: now,
  };
}
