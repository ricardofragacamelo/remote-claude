import type { UserId } from '@domain/auth';
import { clipOutput, TranscriptNotFoundError } from '@domain/transcript';
import type { ClaudeSessionId, ToolOutput } from '@domain/transcript';
import type { TranscriptStore } from './ports/transcript-store.port';
import { readableTranscript } from './readable-transcript';
import type { TranscriptAudience } from './transcript-audience';

/** Which tool of which conversation, for whom. */
export interface ReadToolResultQuery {
  readonly userId: UserId;
  readonly sessionId: ClaudeSessionId;
  readonly toolUseId: string;
}

/**
 * The whole output of one tool of a conversation, read from the transcript when its card is unfolded
 * (plan 22, B-11) — the stream's `summary` is short on purpose.
 *
 * The fence is the reader's: a conversation the caller does not read answers exactly like an id that
 * names nothing, and so does a tool the main chain has no result of — a call still running, a tool of a
 * subagent (S-24, S-25, S-28). Above the ceiling the output comes cut, its first and its last part, and
 * says so: a cut is an answer, not an error (D-08).
 */
export class ReadToolResultUseCase {
  constructor(
    private readonly store: TranscriptStore,
    private readonly audience: TranscriptAudience,
    private readonly maxBytes: number,
  ) {}

  /** @throws {TranscriptNotFoundError} no such conversation for this caller, or no such result */
  async execute(query: ReadToolResultQuery): Promise<ToolOutput> {
    const session = await readableTranscript(
      this.store,
      this.audience,
      query.sessionId,
      query.userId,
    );
    const text = await this.store.toolResult(session, query.toolUseId);

    if (text === null) {
      throw new TranscriptNotFoundError(query.sessionId.value);
    }

    return clipOutput(text, this.maxBytes);
  }
}
