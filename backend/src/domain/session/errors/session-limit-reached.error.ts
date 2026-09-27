import { DomainError } from '@domain/shared';

/**
 * How long a client refused for the limit should wait before asking again.
 *
 * A slot frees when somebody closes a session or one goes idle, and neither is announced to the
 * one who was refused. Half a minute is long enough not to hammer and short enough to be worth
 * waiting for.
 */
export const SESSION_LIMIT_RETRY_AFTER_SECONDS = 30;

/**
 * As many sessions are open as this installation allows.
 *
 * Not an edge case: the limit is derived from the machine's RAM (~222 MB and exactly one
 * subprocess per session, both measured), so the refusal is an ordinary path that has to be
 * translated and has to leave **no orphan subprocess** behind — see
 * docs/plans/01-live-session/decisions.md#d-05 and
 * docs/plans/05-hardening-operations/decisions.md (D-01).
 *
 * `retryAfterSeconds` rides in the params: it is the `Retry-After` of a `429`, and a WebSocket
 * frame has no header to carry it in.
 */
export class SessionLimitReachedError extends DomainError {
  readonly code = 'SESSION_LIMIT_REACHED';
  readonly messageKey = 'session.error.limitReached';

  constructor(readonly limit: number) {
    super(`the limit of ${String(limit)} concurrent sessions has been reached`, {
      limit,
      retryAfterSeconds: SESSION_LIMIT_RETRY_AFTER_SECONDS,
    });
  }
}
