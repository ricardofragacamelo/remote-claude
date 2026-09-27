import { DomainError } from '@domain/shared';

/**
 * The session is busy with something that must not be interleaved: a turn is running, or another
 * undo of it is.
 *
 * An undo in the middle of a turn would put files back underneath a model that is reading and
 * writing them, and the turn would carry on from a disk it never saw. `423`, and the client says a
 * turn is running rather than that something failed (S-43).
 */
export class SessionLockedError extends DomainError {
  readonly code = 'SESSION_LOCKED';
  readonly messageKey = 'session.error.locked';

  constructor(sessionId: string, reason: 'turnRunning' | 'rewindRunning') {
    super(`session ${sessionId} is locked: ${reason}`, { reason });
  }
}
