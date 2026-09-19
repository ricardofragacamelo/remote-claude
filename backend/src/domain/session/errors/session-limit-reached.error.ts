import { DomainError } from '@domain/shared';

/**
 * As many sessions are open as this installation allows.
 *
 * Not an edge case: the limit is a concrete configured number (10 by default, from ~222 MB and
 * exactly one subprocess per session, both measured), so the refusal is an ordinary path that has
 * to be translated and has to leave **no orphan subprocess** behind — see
 * docs/plans/01-live-session/decisions.md#d-05.
 */
export class SessionLimitReachedError extends DomainError {
  readonly code = 'SESSION_LIMIT_REACHED';
  readonly messageKey = 'session.error.limitReached';

  constructor(readonly limit: number) {
    super(`the limit of ${String(limit)} concurrent sessions has been reached`, { limit });
  }
}
