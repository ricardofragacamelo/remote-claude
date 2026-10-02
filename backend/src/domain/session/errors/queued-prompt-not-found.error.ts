import { DomainError } from '@domain/shared';

/**
 * A prompt to take out of the queue that the queue does not have — it never did, or somebody took
 * it out first.
 *
 * `404`. One that already **started** is a different answer, `CONFLICT`: it existed and is now a
 * turn (plan 08, D-14).
 */
export class QueuedPromptNotFoundError extends DomainError {
  readonly code = 'QUEUED_PROMPT_NOT_FOUND';
  readonly messageKey = 'session.error.queuedPromptNotFound';

  constructor(queueId: string) {
    super(`no queued prompt ${queueId}`, { queueId });
  }
}
