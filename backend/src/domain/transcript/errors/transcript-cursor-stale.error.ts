import { DomainError } from '@domain/shared';

/**
 * The message a page cursor pointed at is no longer in the transcript.
 *
 * It was ours, and it was valid when it was handed out; the conversation under it changed shape —
 * a compaction rebuilds the chain the SDK reads. Guessing a position would hand back a page that
 * skips or repeats messages, which is the one thing a cursor exists to prevent. So it is refused,
 * and the client starts again from the tail.
 */
export class TranscriptCursorStaleError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'transcript.error.cursorStale';

  constructor(sessionId: string) {
    super(`the cursor no longer points at a message of transcript ${sessionId}`, { sessionId });
  }
}
