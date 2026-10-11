import { InvalidConversationRefError } from '@domain/engine';
import type { ConversationRef } from '@domain/engine';
import type { TranscriptMessage, TranscriptSession } from '@domain/transcript';
import type {
  EngineTranscriptStore,
  StoredImage,
  TranscriptStore,
} from './ports/transcript-store.port';

/**
 * The history of every engine enabled here, read as one (plan 28, B-11): a listing is the
 * conversations of all of them, newest first; anything about one conversation goes to the store of
 * its engine. The use cases read a {@link TranscriptStore} and never learn there is more than one.
 */
export class TranscriptStoreRegistry implements TranscriptStore {
  private readonly stores: ReadonlyMap<string, EngineTranscriptStore>;

  /**
   * @param stores one per engine enabled, at least one
   * @param defaultEngine the engine a route of the previous protocol names — one of [stores]
   * @throws {Error} no store, or a default that is not one of them
   */
  constructor(
    stores: readonly EngineTranscriptStore[],
    readonly defaultEngine: string,
  ) {
    this.stores = new Map(stores.map((store) => [store.engine.value, store]));
    if (!this.stores.has(defaultEngine)) {
      throw new Error(`the default engine "${defaultEngine}" has no history store`);
    }
  }

  /** Whether [engine] is enabled here — a conversation of any other does not exist. */
  has(engine: string): boolean {
    return this.stores.has(engine);
  }

  /**
   * The conversation [id] of [engine], checked by the engine's own rule.
   *
   * @throws {InvalidConversationRefError} an engine not enabled, or an id it never hands out
   */
  conversation(engine: string, id: string): ConversationRef {
    const ref = this.stores.get(engine)?.conversationOf(id) ?? null;
    if (ref === null) {
      throw new InvalidConversationRefError(engine, id);
    }
    return ref;
  }

  async list(directory: string): Promise<readonly TranscriptSession[]> {
    return newestFirst(await Promise.all(this.all.map((store) => store.list(directory))));
  }

  async listAll(): Promise<readonly TranscriptSession[]> {
    return newestFirst(await Promise.all(this.all.map((store) => store.listAll())));
  }

  find(id: ConversationRef): Promise<TranscriptSession | null> {
    const store = this.stores.get(id.engine.value);
    return store === undefined ? Promise.resolve(null) : store.find(id);
  }

  messages(session: TranscriptSession): Promise<readonly TranscriptMessage[]> {
    return this.storeOf(session).messages(session);
  }

  subagentMessages(
    session: TranscriptSession,
    toolUseId: string,
  ): Promise<readonly TranscriptMessage[] | null> {
    return this.storeOf(session).subagentMessages(session, toolUseId);
  }

  toolResult(session: TranscriptSession, toolUseId: string): Promise<string | null> {
    return this.storeOf(session).toolResult(session, toolUseId);
  }

  promptImage(session: TranscriptSession, blockId: string): Promise<StoredImage | null> {
    return this.storeOf(session).promptImage(session, blockId);
  }

  private get all(): readonly EngineTranscriptStore[] {
    return [...this.stores.values()];
  }

  /** The store of a conversation one of the stores found — and so one of an enabled engine. */
  private storeOf(session: TranscriptSession): EngineTranscriptStore {
    const store = this.stores.get(session.id.engine.value);
    if (store === undefined) {
      throw new InvalidConversationRefError(session.id.engine.value, session.id.id);
    }
    return store;
  }
}

/** The listings of every engine, as one, newest first — the order a listing promises. */
function newestFirst(
  lists: readonly (readonly TranscriptSession[])[],
): readonly TranscriptSession[] {
  return lists.flat().sort((a, b) => b.lastModified - a.lastModified);
}
