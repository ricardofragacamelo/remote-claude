import { DomainError } from '@domain/shared';

/**
 * The point an undo was asked to go back to is not one of this session's.
 *
 * `INVALID_INPUT`: the id may be a real turn — of another session, or one that wrote nothing — but
 * it is not a checkpoint this session reaches, and guessing what was meant is how an undo ends up
 * putting back files nobody asked about (S-61).
 */
export class RewindTargetUnknownError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'session.error.rewindTargetUnknown';

  constructor(promptId: string) {
    super(`${promptId} is not an undo point of this session`, { promptId });
  }
}
