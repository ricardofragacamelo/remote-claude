import type { UserId } from '@domain/auth';
import type { ClaudeSessionId } from '@domain/transcript';

/**
 * Which conversations this backend opened, and for whom.
 *
 * The SDK cannot answer it — `SDKSessionInfo` has no provenance — so it is answered by the row
 * `session` writes when it opens one. It is not a label: the origin also decides, in a later phase,
 * whether a resume continues the file or forks it, so a wrong answer here means writing into the
 * transcript of another consumer ([D-04](../../../../../docs/plans/04-transcript-and-resume/decisions.md)).
 */
export interface TranscriptOriginSource {
  /** Who opened each of these here. An id this backend never opened is absent from the map. */
  openersOf(ids: readonly ClaudeSessionId[]): Promise<ReadonlyMap<string, UserId>>;
}

export const TRANSCRIPT_ORIGIN_SOURCE = Symbol('TranscriptOriginSource');
