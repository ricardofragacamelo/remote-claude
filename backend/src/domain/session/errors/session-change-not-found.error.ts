import { DomainError } from '@domain/shared';

/**
 * A file asked of the changes of a session that the session never touched — or a rejection to undo
 * that is not there any more.
 *
 * `404`: the session exists and is the caller's; the path names nothing it changed (plan 08, S-116).
 */
export class SessionChangeNotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly messageKey = 'session.error.changeNotFound';

  constructor(path: string) {
    super(`${path} is not a file this session changed`, { path });
  }
}
