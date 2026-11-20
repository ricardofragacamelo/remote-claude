import { DomainError } from '@domain/shared';

/**
 * The caller already has as many searches running as it may — S-73, S-74.
 *
 * The same `RATE_LIMITED` code and `common.error.rateLimited` key every other rate limit of this
 * backend uses ([shared's own `RateLimitedError`](../../../shared/errors/rate-limited.error.ts)),
 * reproduced here rather than imported: `application/` never reaches into `shared/` (the
 * Dependency Rule), so each domain that refuses by rate carries its own error, same shape, same
 * catalogue entry. `retryAfterSeconds` rides in `params` for the same reason the shared one does —
 * it becomes the HTTP `Retry-After` header.
 */
export class SearchRateLimitedError extends DomainError {
  readonly code = 'RATE_LIMITED';
  readonly messageKey = 'common.error.rateLimited';

  constructor(scope: string, limit: number, retryAfterSeconds: number) {
    super(`rate limit reached: ${scope} over ${String(limit)}`, {
      scope,
      limit,
      retryAfterSeconds,
    });
  }
}
