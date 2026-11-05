import type { NoticeStore } from '@application/notice';
import type { ConversationRef } from '@domain/engine';
import type { SessionNoticePayload } from '@remote-claude/contracts';

/**
 * An in-memory [NoticeStore] — the same idempotency and ordering the Postgres one guarantees
 * (S-109…S-112), without a database.
 *
 * `failRecord` mirrors the real repository's own contract (S-116): set, it still never rejects —
 * it just never keeps the notice either, the same as a write that failed and was logged and
 * swallowed by the real implementation. `failListFor` does reject — `listFor` carries no such
 * promise, and S-121 is exactly a caller proving it survives that one failing.
 */
export class FakeNoticeStore implements NoticeStore {
  private readonly byConversation = new Map<string, Map<string, SessionNoticePayload>>();

  failRecord = false;
  failListFor: Error | null = null;
  recordCalls = 0;

  async record(conversation: ConversationRef, payload: SessionNoticePayload): Promise<void> {
    this.recordCalls += 1;

    if (this.failRecord) {
      return;
    }

    const kept =
      this.byConversation.get(conversation.key) ?? new Map<string, SessionNoticePayload>();

    if (!kept.has(payload.noticeId)) {
      kept.set(payload.noticeId, payload);
    }

    this.byConversation.set(conversation.key, kept);
  }

  async listFor(conversation: ConversationRef): Promise<readonly SessionNoticePayload[]> {
    if (this.failListFor !== null) {
      throw this.failListFor;
    }

    return [...(this.byConversation.get(conversation.key)?.values() ?? [])];
  }
}
