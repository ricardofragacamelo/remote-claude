import { DomainError } from '@domain/shared';

/**
 * A file to reject that the undo point does not reach — one the session never wrote.
 *
 * `INVALID_INPUT`, the same answer as a point that is not one: guessing what was meant is how an
 * undo ends up putting back a file nobody asked about (plan 08, S-136).
 */
export class RewindPathUnknownError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'session.error.rewindPathUnknown';

  constructor(path: string) {
    super(`${path} is not a file this undo point reaches`, { path });
  }
}
