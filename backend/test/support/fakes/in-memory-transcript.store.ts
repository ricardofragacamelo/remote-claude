import type { EngineTranscriptStore, StoredImage } from '@application/transcript';
import { ConversationRef, EngineId } from '@domain/engine';
import type { TranscriptMessage, TranscriptSession } from '@domain/transcript';

/** A UUID in the canonical form — the ids the store of the product hands out. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Claude's store, as the port sees it: sessions filed by directory, and their messages.
 *
 * What it answers about `[]` is what the SDK answers — an empty conversation and an absent one both
 * have no messages — so a use case that forgot to ask `find` first would be caught here too.
 */
export class InMemoryTranscriptStore implements EngineTranscriptStore {
  readonly engine: EngineId;

  constructor(engine = 'claude') {
    this.engine = EngineId.create(engine);
  }

  conversationOf(id: string): ConversationRef | null {
    return UUID.test(id) ? ConversationRef.create(this.engine.value, id) : null;
  }

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
    this.messagesById.set(session.id.id, messages);
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

  find(id: ConversationRef): Promise<TranscriptSession | null> {
    const session = [...this.byDirectory.values()].flat().find((each) => each.id.equals(id));
    if (session === undefined) {
      return Promise.resolve(null);
    }
    return Promise.resolve(this.unknownCwd.has(session.id.id) ? { ...session, cwd: null } : session);
  }

  /** Ids a transcript the engine cannot resolve a folder for by id alone — `list` still can, the way
   * a transcript too large for the real SDK's id-only lookup to find a `cwd` line in still lists
   * correctly under the root it ran in (S-163). */
  private readonly unknownCwd = new Set<string>();

  obscureCwd(sessionId: string): this {
    this.unknownCwd.add(sessionId);
    return this;
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
    return Promise.resolve(this.subagentsByTool.get(`${session.id.id}/${toolUseId}`) ?? null);
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
    return Promise.resolve(this.results.get(`${session.id.id}/${toolUseId}`) ?? null);
  }

  promptImage(session: TranscriptSession, blockId: string): Promise<StoredImage | null> {
    return Promise.resolve(this.images.get(`${session.id.id}/${blockId}`) ?? null);
  }

  /** Replaces what a conversation holds — it was written to — and moves its version. */
  rewrite(sessionId: string, messages: readonly TranscriptMessage[], lastModified: number): this {
    this.messagesById.set(sessionId, messages);
    for (const [directory, sessions] of this.byDirectory) {
      this.byDirectory.set(
        directory,
        sessions.map((each) => (each.id.id === sessionId ? { ...each, lastModified } : each)),
      );
    }
    return this;
  }

  /** Takes a conversation out of the store, as if its file were deleted. */
  remove(sessionId: string): this {
    for (const [directory, sessions] of this.byDirectory) {
      this.byDirectory.set(
        directory,
        sessions.filter((each) => each.id.id !== sessionId),
      );
    }
    return this;
  }

  messages(session: TranscriptSession): Promise<readonly TranscriptMessage[]> {
    this.reads += 1;
    return Promise.resolve(this.messagesById.get(session.id.id) ?? []);
  }
}
