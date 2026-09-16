import { DomainError } from '@domain/shared';

/**
 * The session does not exist, or the caller may not know that it does.
 *
 * Those two are deliberately the same answer: replying `403` for a session owned by someone else
 * confirms its existence to whoever is probing.
 */
export class SessionNotFoundError extends DomainError {
  readonly code = 'SESSION_NOT_FOUND';
  readonly messageKey = 'session.error.notFound';

  constructor(sessionId: string) {
    super(`session ${sessionId} not found`, { sessionId });
  }
}
