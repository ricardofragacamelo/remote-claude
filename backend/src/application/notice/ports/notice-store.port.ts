import type { ConversationRef } from '@domain/engine';
import type { SessionNoticePayload } from '@remote-claude/contracts';

/**
 * Where a `session.notice` lives once the engine itself never writes it anywhere durable (plan 27,
 * F7, D-15) — an agent hook's own warning, measured: no trace at all in the transcript, not even an
 * empty marker. This is not a second copy of the transcript
 * ([backend/05-persistence](../../../../../docs/architecture/backend/05-persistence.md#o-que-vai-para-o-banco-e-o-que-não-vai)) —
 * it is the **only** place this content is ever kept.
 *
 * Keyed by [ConversationRef] — `(engine, conversationId)` — never one engine's own id alone
 * (plan 28): any engine's own adapter can write and read through the same port.
 */
export interface NoticeStore {
  /**
   * Keeps [payload] under `payload.noticeId`, once. Recording the same `noticeId` again — in
   * sequence or at once with another recording of it — changes nothing: the first one kept wins
   * (S-110, S-111).
   *
   * **Never rejects.** A notice is a side copy of something the client already received live
   * (Plan 27, F7, D-15) — a failure to keep it is the implementation's own to log and swallow,
   * never the live session's to crash over (S-116).
   */
  record(conversation: ConversationRef, payload: SessionNoticePayload): Promise<void>;

  /** Every notice kept for [conversation], oldest first — empty for one that never had any (S-112). */
  listFor(conversation: ConversationRef): Promise<readonly SessionNoticePayload[]>;
}

export const NOTICE_STORE = Symbol('NoticeStore');
