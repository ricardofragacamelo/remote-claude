import { DomainError } from '@domain/shared';

/**
 * One connection asked to watch more folders than it may — `429`.
 *
 * Closing a watch frees a place; `params.limit` says how many there are.
 */
export class WatchLimitReachedError extends DomainError {
  readonly code = 'WATCH_LIMIT_REACHED';
  readonly messageKey = 'files.error.watchLimitReached';

  constructor(limit: number) {
    super(`this connection already watches ${String(limit)} folders`, { limit });
  }
}
