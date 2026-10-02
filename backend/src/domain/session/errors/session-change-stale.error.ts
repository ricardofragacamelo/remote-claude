import { DomainError } from '@domain/shared';

/**
 * A hunk to reject was computed against a disk that has since changed.
 *
 * `409`: applying it now would put back lines next to text nobody looked at. The client reloads
 * the hunks of the file and lets the person choose again (plan 08, D-08).
 */
export class SessionChangeStaleError extends DomainError {
  readonly code = 'SESSION_CHANGE_STALE';
  readonly messageKey = 'session.error.changeStale';

  constructor(path: string) {
    super(`the hunks of ${path} were computed against a disk that changed`, { path });
  }
}
