import { statusFor } from '@domain/session';
import type { Session, SessionStatus } from '@domain/session';

/**
 * Moves a session's status from an event, and says what — if anything — has to be announced.
 *
 * Written once because two very different things feed the machine. Most of the stream comes
 * through the runner; `permission.requested` and `permission.resolved` come from the permission
 * bridge, which is the only thing that knows the agent loop has stopped on a person. A second
 * copy of this inference is how `waitingPermission` ends up published by one of them and not by
 * the other — and `waitingPermission` is the one status the UI cannot afford to confuse with
 * `running`, because a spinner for something that will never finish on its own is a lie.
 *
 * `observe` and not `moveTo`: a status derived from somebody else's stream must not be able to end
 * a session on the user's machine. An order this build did not expect leaves the status where it
 * was, exactly as an unknown message variant is dropped rather than raised.
 *
 * @returns the new status when it actually changed, and `null` when nothing has to be published
 */
export function observedStatus(session: Session, eventType: string): SessionStatus | null {
  const before = session.status;
  const next = statusFor(eventType);

  if (next === null || session.isClosed) {
    return null;
  }

  session.observe(next);

  return session.status === before ? null : session.status;
}
