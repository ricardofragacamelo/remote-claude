import { DomainError } from '@domain/shared';

/**
 * A prompt to take out of the queue that has already become a turn.
 *
 * `CONFLICT`, because it is the state that moved, not the request that was wrong: to stop it now
 * is to interrupt the turn (plan 08, D-14).
 */
export class QueuedPromptStartedError extends DomainError {
  readonly code = 'CONFLICT';
  readonly messageKey = 'session.error.queuedPromptStarted';

  constructor(queueId: string) {
    super(`queued prompt ${queueId} already started`, { queueId });
  }
}
