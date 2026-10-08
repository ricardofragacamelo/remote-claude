import type { StoredImage, TranscriptStore } from '@application/transcript';
import type { ClaudeSessionId, TranscriptMessage, TranscriptSession } from '@domain/transcript';

/**
 * Claude's store, as the port sees it: sessions filed by directory, and their messages.
 *
 * What it answers about `[]` is what the SDK answers — an empty conversation and an absent one both
 * have no messages — so a use case that forgot to ask `find` first would be caught here too.
 */
export class InMemoryTranscriptStore implements TranscriptStore {
  private readonly byDirectory = new Map<string, TranscriptSession[]>();
  private readonly messagesById = new Map<string, readonly TranscriptMessage[]>();

  /** Every directory `list` was asked about, in order. */
  readonly listed: string[] = [];

  /** How many times the messages were read. */
  reads = 0;

  add(
    directory: string,
    session: TranscriptSession,
    messages: readonly TranscriptMessage[] = [],
  ): this {
    this.byDirectory.set(directory, [...(this.byDirectory.get(directory) ?? []), session]);
    this.messagesById.set(session.id.value, messages);
    return this;
  }

  list(directory: string): Promise<readonly TranscriptSession[]> {
    this.listed.push(directory);
    return Promise.resolve(this.byDirectory.get(directory) ?? []);
  }

  /** How many times the whole store was listed. */
  wholeListings = 0;

  listAll(): Promise<readonly TranscriptSession[]> {
    this.wholeListings += 1;
    return Promise.resolve([...this.byDirectory.values()].flat());
  }

  find(id: ClaudeSessionId): Promise<TranscriptSession | null> {
    const session = [...this.byDirectory.values()].flat().find((each) => each.id.equals(id));
    return Promise.resolve(session ?? null);
  }

  private readonly subagentsByTool = new Map<string, readonly TranscriptMessage[]>();

  /** Files the messages of the subagent the tool `toolUseId` of `sessionId` opened. */
  addSubagent(sessionId: string, toolUseId: string, messages: readonly TranscriptMessage[]): this {
    this.subagentsByTool.set(`${sessionId}/${toolUseId}`, messages);
    return this;
  }

  subagentMessages(
    session: TranscriptSession,
    toolUseId: string,
  ): Promise<readonly TranscriptMessage[] | null> {
    return Promise.resolve(this.subagentsByTool.get(`${session.id.value}/${toolUseId}`) ?? null);
  }

  private readonly results = new Map<string, string>();
  private readonly images = new Map<string, StoredImage>();

  /** Files the whole output of a tool of a conversation. */
  addToolResult(sessionId: string, toolUseId: string, text: string): this {
    this.results.set(`${sessionId}/${toolUseId}`, text);
    return this;
  }

  /** Files the image a prompt of a conversation carried, under its marker's `blockId`. */
  addImage(sessionId: string, blockId: string, image: StoredImage): this {
    this.images.set(`${sessionId}/${blockId}`, image);
    return this;
  }

  toolResult(session: TranscriptSession, toolUseId: string): Promise<string | null> {
    return Promise.resolve(this.results.get(`${session.id.value}/${toolUseId}`) ?? null);
  }

  promptImage(session: TranscriptSession, blockId: string): Promise<StoredImage | null> {
    return Promise.resolve(this.images.get(`${session.id.value}/${blockId}`) ?? null);
  }

  /** Replaces what a conversation holds — it was written to — and moves its version. */
  rewrite(sessionId: string, messages: readonly TranscriptMessage[], lastModified: number): this {
    this.messagesById.set(sessionId, messages);
    for (const [directory, sessions] of this.byDirectory) {
      this.byDirectory.set(
        directory,
        sessions.map((each) => (each.id.value === sessionId ? { ...each, lastModified } : each)),
      );
    }
    return this;
  }

  /** Takes a conversation out of the store, as if its file were deleted. */
  remove(sessionId: string): this {
    for (const [directory, sessions] of this.byDirectory) {
      this.byDirectory.set(
        directory,
        sessions.filter((each) => each.id.value !== sessionId),
      );
    }
    return this;
  }

  messages(session: TranscriptSession): Promise<readonly TranscriptMessage[]> {
    this.reads += 1;
    return Promise.resolve(this.messagesById.get(session.id.value) ?? []);
  }
}
