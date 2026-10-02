import { DomainError } from '@domain/shared';

/** How long a client waits before trying a write again while the trail is down. */
export const TRAIL_RETRY_AFTER_SECONDS = 5;

/**
 * The trail could not record the write, so nothing was written — `503`.
 *
 * `SERVICE_UNAVAILABLE` and not the undo's `INTERNAL_ERROR`, on purpose: here the request is HTTP,
 * and a database that is down is a dependency that is out, which `503` says and `500` (a bug of
 * ours) does not. The client retries after `retryAfterSeconds`; nothing reached the disk
 * ([07 · D-02](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-02--a-escrita-humana-na-trilha)).
 */
export class FileTrailUnavailableError extends DomainError {
  readonly code = 'SERVICE_UNAVAILABLE';
  readonly messageKey = 'files.error.trailUnavailable';

  constructor(
    path: string,
    /** What the database said. `override` because `Error` already declares a `cause`. */
    override readonly cause: unknown,
  ) {
    super(`the trail could not record a write to ${path}; nothing was written`, {
      path,
      retryAfterSeconds: TRAIL_RETRY_AFTER_SECONDS,
    });
  }
}
