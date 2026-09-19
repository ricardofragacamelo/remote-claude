import { UserId } from '@domain/auth';
import { DiagSession } from '@domain/diag';
import { SessionId } from '@domain/session';

/** A diagnostic session with sensible defaults, so a test states only what it cares about. */
export function aDiagSession(
  overrides: {
    id?: string;
    ownerId?: string;
    openedAt?: Date;
    lastPingedAt?: Date;
    pingCount?: number;
  } = {},
): DiagSession {
  const openedAt = overrides.openedAt ?? new Date('2026-09-13T12:00:00.000Z');

  return DiagSession.restore({
    id: SessionId.create(overrides.id ?? '01J0ABCDEFGHJKMNPQRSTVWXYZ'),
    ownerId: UserId.create(overrides.ownerId ?? 'auth|owner'),
    openedAt,
    lastPingedAt: overrides.lastPingedAt ?? openedAt,
    pingCount: overrides.pingCount ?? 0,
  });
}
