import { DomainError } from '@domain/shared';

/** Which ceiling a follow went past: the connection's own, or the server's over every connection. */
export type FollowLimitScope = 'connection' | 'server';

/**
 * One conversation followed too many — `429` (plan 22, D-11).
 *
 * A ceiling and not a degradation: past it the follow is refused, said with the limit, and the reader
 * stays readable without following. Letting one more go would let a page that leaks subscriptions hold
 * a tick of the store open per tab, forever.
 */
export class TranscriptFollowLimitError extends DomainError {
  readonly code = 'TRANSCRIPT_FOLLOW_LIMIT';
  readonly messageKey = 'transcript.error.followLimit';

  constructor(limit: number, scope: FollowLimitScope) {
    super(`at most ${String(limit)} conversations may be followed per ${scope}`, { limit, scope });
  }
}
