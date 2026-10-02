import type { UserId } from '@domain/auth';
import type { ChainEntry } from '@domain/session';
import type { ClaudeSessionId } from '@domain/transcript';

/**
 * A conversation in Claude's store, as much of it as deciding a resume needs — and not a message.
 *
 * The workspace it ran in, and who opened it here. Nothing it said: the transcript is Claude's file
 * and is read by `transcript` alone, and a resume does not need a line of it to decide.
 */
export interface ResumableConversation {
  readonly id: ClaudeSessionId;

  /** The working directory the SDK recorded, raw; `null` when it recorded none. */
  readonly cwd: string | null;

  /** Who opened it here, when this backend did; `undefined` for one begun elsewhere. */
  readonly openedBy: UserId | undefined;
}

/**
 * Where `session` asks about a conversation it was told to continue.
 *
 * Declared here, by the consumer, and answered by an adapter that asks `transcript` and the
 * provenance `session` itself keeps — the whole of the coupling between the two modules
 * (docs/architecture/backend/03-modules.md#fronteiras).
 */
export interface ResumableConversationSource {
  /**
   * The conversation, or `null` when Claude's store holds no transcript with that id.
   *
   * @throws {import('@domain/transcript').TranscriptUnavailableError} the SDK failed
   * @throws {import('@domain/transcript').TranscriptTimeoutError} the SDK did not answer in time
   */
  find(id: ClaudeSessionId): Promise<ResumableConversation | null>;

  /**
   * The entries of the conversation, oldest first, each said to be a prompt or not — what an
   * edit-and-resend chooses its fork point from (plan 08, D-19). Read through the SDK, never parsed;
   * nothing a message said leaves `transcript`.
   *
   * @throws as {@link find}
   */
  chainOf(id: ClaudeSessionId): Promise<readonly ChainEntry[]>;
}

export const RESUMABLE_CONVERSATION_SOURCE = Symbol('ResumableConversationSource');
