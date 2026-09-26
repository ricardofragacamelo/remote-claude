import type { UserId } from '@domain/auth';
import { pageFromTail, TranscriptNotFoundError, transcriptOriginFor } from '@domain/transcript';
import type {
  ClaudeSessionId,
  Page,
  TranscriptMessage,
  VisibleTranscriptSession,
} from '@domain/transcript';
import type { WorkspaceAllowlistSource } from '@application/workspace';
import type { TranscriptOriginSource } from './ports/transcript-origin.source';
import type { TranscriptStore } from './ports/transcript-store.port';

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
  readonly session: VisibleTranscriptSession;
  readonly page: Page<TranscriptMessage, string>;
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
    private readonly allowlist: WorkspaceAllowlistSource,
    private readonly store: TranscriptStore,
    private readonly origins: TranscriptOriginSource,
  ) {}

  /**
   * @throws {TranscriptNotFoundError} no such transcript, or not one this caller may read
   * @throws {import('@domain/transcript').TranscriptCursorStaleError} the cursor's message is gone
   */
  async execute(query: ReadTranscriptQuery): Promise<TranscriptPage> {
    const session = await this.store.find(query.sessionId);

    if (session === null) {
      throw new TranscriptNotFoundError(query.sessionId.value);
    }

    const openers = await this.origins.openersOf([session.id]);
    const origin = transcriptOriginFor(session, {
      allowlist: this.allowlist.current(),
      userId: query.userId,
      openedBy: openers.get(session.id.value),
    });

    if (origin === null) {
      throw new TranscriptNotFoundError(query.sessionId.value);
    }

    const messages = await this.store.messages(session);

    return {
      session: { ...session, origin },
      page: pageFromTail(session.id.value, messages, query.before, query.limit),
    };
  }
}
