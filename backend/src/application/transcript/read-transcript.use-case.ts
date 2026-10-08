import type { UserId } from '@domain/auth';
import { pageFromTail, TranscriptNotFoundError } from '@domain/transcript';
import type { ClaudeSessionId, Page, TranscriptMessage } from '@domain/transcript';
import type { TranscriptStore } from './ports/transcript-store.port';
import { readableTranscript } from './readable-transcript';
import type { ListedTranscript, TranscriptAudience } from './transcript-audience';

/** Which page of which conversation, for whom. */
export interface ReadTranscriptQuery {
  readonly userId: UserId;
  readonly sessionId: ClaudeSessionId;

  /** The cursor the previous page handed out, or `null` for the latest messages. */
  readonly before: string | null;

  readonly limit: number;
}

/** A page of a conversation, and the conversation it is a page of. */
export interface TranscriptPage {
  /** The conversation, with what it is doing now — the panel asks before forking one that is active. */
  readonly session: ListedTranscript;
  readonly page: Page<TranscriptMessage, string>;

  /**
   * The last entry of the whole conversation, whatever page this is — `null` when it has none. It is
   * what `transcript.follow` follows from, so nothing written after the page is missed (plan 22, B-10).
   */
  readonly lastMessageId: string | null;
}

/**
 * One page of a conversation, from the tail.
 *
 * Existence is asked first, and of `getSessionInfo`: the messages come back empty both for an
 * empty conversation and for an id that names nothing, and only the metadata tells them apart
 * (S-03, S-56). Then the same fence as the listing — a conversation that would not be **listed**
 * for this caller is not **read** by them either, and the answer is the one an absent id gets
 * (S-04). Only then is the expensive read paid, and it is cached.
 */
export class ReadTranscriptUseCase {
  constructor(
    private readonly store: TranscriptStore,
    private readonly audience: TranscriptAudience,
  ) {}

  /**
   * @throws {TranscriptNotFoundError} no such transcript, or not one this caller may read
   * @throws {import('@domain/transcript').TranscriptCursorStaleError} the cursor's message is gone
   */
  async execute(query: ReadTranscriptQuery): Promise<TranscriptPage> {
    const session = await this.visible(query);
    const messages = await this.store.messages(session);

    return {
      session,
      page: pageFromTail(session.id.value, messages, query.before, query.limit),
      lastMessageId: messages.at(-1)?.id ?? null,
    };
  }

  /**
   * One page of what a subagent of the conversation said, from the tail — loaded when its tool is
   * unfolded in the panel (plan 08, B-21). The conversation is fenced exactly as it is read: a
   * subagent of a conversation this caller does not read is as absent as one that never was (S-91).
   *
   * @throws {TranscriptNotFoundError} no such conversation, not this caller's, or no subagent of
   *   that tool in it
   */
  async subagent(
    query: ReadTranscriptQuery & { readonly toolUseId: string },
  ): Promise<Page<TranscriptMessage, string>> {
    const session = await this.visible(query);
    const messages = await this.store.subagentMessages(session, query.toolUseId);

    if (messages === null) {
      throw new TranscriptNotFoundError(query.sessionId.value);
    }

    return pageFromTail(session.id.value, messages, query.before, query.limit);
  }

  /** The conversation, when it exists and this caller may read it — the same answer otherwise. */
  private visible(query: ReadTranscriptQuery): Promise<ListedTranscript> {
    return readableTranscript(this.store, this.audience, query.sessionId, query.userId);
  }
}
