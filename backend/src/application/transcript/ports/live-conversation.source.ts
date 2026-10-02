import type { UserId } from '@domain/auth';
import type { ClaudeSessionId } from '@domain/transcript';

/**
 * Which live session of a caller holds a conversation, if one does.
 *
 * The registry of live sessions is `session`'s; `transcript` declares the question it needs answered
 * — to label a conversation `liveHere` instead of guessing (plan 08, B-08) — and an adapter joins the
 * two ends, the way {@link import('./transcript-origin.source').TranscriptOriginSource} does.
 */
export interface LiveConversationSource {
  /**
   * The id of the caller's live session that is this conversation or continues it, or `null`.
   *
   * Only the caller's: somebody else's live continuation of a conversation is theirs.
   */
  liveSessionOf(conversation: ClaudeSessionId, userId: UserId): string | null;
}

export const LIVE_CONVERSATION_SOURCE = Symbol('LiveConversationSource');
