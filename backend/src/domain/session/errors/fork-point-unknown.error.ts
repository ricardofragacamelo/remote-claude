import { DomainError } from '@domain/shared';

/**
 * An edit-and-resend names a message the conversation does not have, or one that is not a prompt.
 *
 * `INVALID_INPUT` and not `404`: the conversation exists, and the point inside it is what was
 * asked wrongly — the same answer the undo gives a point that is not its own (plan 08, D-19).
 */
export class ForkPointUnknownError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'session.error.forkPointUnknown';

  constructor(messageId: string) {
    super(`${messageId} is not a prompt of this conversation`, { messageId });
  }
}
