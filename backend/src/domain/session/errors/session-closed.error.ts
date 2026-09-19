import { DomainError } from '@domain/shared';

/**
 * The session is over.
 *
 * It answers `SESSION_NOT_FOUND` rather than a code of its own: to everything outside, a closed
 * session and one that never existed are the same thing, and a distinct code would be the only
 * way to learn that a session id was once real.
 */
export class SessionClosedError extends DomainError {
  readonly code = 'SESSION_NOT_FOUND';
  readonly messageKey = 'session.error.notFound';

  constructor(sessionId: string) {
    super(`session ${sessionId} is closed`, { sessionId });
  }
}
