import { DomainError } from '@domain/shared';

/**
 * No transcript by that id that this caller may read.
 *
 * Three different facts answer this, and on purpose the same way: the id names no file, the file
 * reports no working directory inside a root of the caller, or it is a session another person
 * opened here. Telling a caller that a conversation exists and is not theirs is telling them it
 * exists — the same reasoning a device of somebody else follows (`auth.error.deviceNotFound`).
 */
export class TranscriptNotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly messageKey = 'transcript.error.notFound';

  constructor(readonly sessionId: string) {
    super(`no transcript ${sessionId} this caller may read`, { sessionId });
  }
}
