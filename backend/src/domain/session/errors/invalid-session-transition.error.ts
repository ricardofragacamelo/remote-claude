import { DomainError } from '@domain/shared';

import type { SessionStatus } from '../value-objects/session-status.value-object';

/**
 * The machine was asked to do something it does not do.
 *
 * It is a bug of ours and never of the caller's — no command names a status, and the transitions
 * are driven by what the Agent SDK reports. So it carries `INTERNAL_ERROR`: answering `400` here
 * would blame a client for a state machine it cannot see.
 */
export class InvalidSessionTransitionError extends DomainError {
  readonly code = 'INTERNAL_ERROR';
  readonly messageKey = 'session.error.invalidTransition';

  constructor(sessionId: string, from: SessionStatus, to: SessionStatus) {
    super(`session ${sessionId} cannot go from ${from} to ${to}`, { sessionId, from, to });
  }
}
