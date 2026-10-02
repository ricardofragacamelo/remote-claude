import { DomainError } from '@domain/shared';

/**
 * The CLI refused the point an edit-and-resend forks from.
 *
 * With `resumeDropsTurn` the CLI checks that everything past the point belongs to the turn being
 * rewritten, and refuses deterministically when it does not. `409`, and the screen offers the plain
 * resume instead of retrying the same fork (plan 08, D-19).
 */
export class SessionForkRejectedError extends DomainError {
  readonly code = 'SESSION_FORK_REJECTED';
  readonly messageKey = 'session.error.forkRejected';

  constructor(conversationId: string) {
    super(`the cli refused to fork ${conversationId} at that point`, { conversationId });
  }
}
