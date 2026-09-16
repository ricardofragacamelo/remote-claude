import { UserId } from '@domain/auth';
import { Session, SessionId } from '@domain/session';

/** A session with sensible defaults, so a test states only what it cares about. */
export function aSession(
  overrides: {
    id?: string;
    ownerId?: string;
    openedAt?: Date;
    lastPingedAt?: Date;
    pingCount?: number;
  } = {},
): Session {
  const openedAt = overrides.openedAt ?? new Date('2026-09-13T12:00:00.000Z');

  return Session.restore({
    id: SessionId.create(overrides.id ?? '01J0ABCDEFGHJKMNPQRSTVWXYZ'),
    ownerId: UserId.create(overrides.ownerId ?? 'auth|owner'),
    openedAt,
    lastPingedAt: overrides.lastPingedAt ?? openedAt,
    pingCount: overrides.pingCount ?? 0,
  });
}
