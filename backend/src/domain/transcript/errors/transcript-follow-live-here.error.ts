import { DomainError } from '@domain/shared';

/**
 * A follow of a conversation a live session of the caller holds — `409` (plan 22, B-16).
 *
 * The screen of that session shows it as it goes, by `session.attach`, and with everything the
 * transcript does not have: the deltas, the permissions, the queue. Following its transcript too
 * would show the same answer twice, the second one late.
 */
export class TranscriptFollowLiveHereError extends DomainError {
  readonly code = 'TRANSCRIPT_FOLLOW_LIVE_HERE';
  readonly messageKey = 'transcript.error.followLiveHere';

  constructor(liveSessionId: string) {
    super(`conversation is held by the live session ${liveSessionId}`, { liveSessionId });
  }
}
