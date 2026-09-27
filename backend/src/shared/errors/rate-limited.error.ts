import { DomainError } from '@domain/shared';

/**
 * A client sent more than it may, and has to wait.
 *
 * `retryAfterSeconds` rides in the params because it is the whole point of the refusal: over HTTP
 * it becomes the `Retry-After` header, and on a WebSocket — which has no header to put it in — the
 * client reads it from the frame. A refusal without it is a refusal the client answers by trying
 * again at once (docs/architecture/shared/04-errors-and-http.md).
 */
export class RateLimitedError extends DomainError {
  readonly code = 'RATE_LIMITED';
  readonly messageKey = 'common.error.rateLimited';

  /**
   * @param scope what was over its limit — `frames` or `attachedSessions` — for the log and for a
   *   client that wants to say which
   * @param limit the limit that was reached
   */
  constructor(scope: string, limit: number, retryAfterSeconds: number) {
    super(`rate limit reached: ${scope} over ${String(limit)}`, {
      scope,
      limit,
      retryAfterSeconds,
    });
  }
}
