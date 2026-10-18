import type { ConversationRef, EngineId } from '@domain/engine';
import type { TranscriptMessage, TranscriptSession } from '@domain/transcript';

/**
 * The engine's own store of conversations, read — never written, never parsed by us.
 *
 * The one implementation calls `listSessions`, `getSessionInfo` and `getSessionMessages` of the
 * engine. The JSONL behind them is internal to the engine's own installation, changes without notice
 * and is the same file the editor uses; a parser of our own would break on the next release of the
 * engine, silently (docs/architecture/backend/03-modules.md#transcript). `pnpm lint:arch` holds the
 * line: nothing in this module may reach for the filesystem.
 *
 * Every method throws `TranscriptUnavailableError` when the engine fails and `TranscriptTimeoutError`
 * when it does not answer in time — never a raw error of the engine.
 */
export interface TranscriptStore {
  /**
   * The sessions of **one** directory, exactly — never the whole store.
   *
   * One `listSessions({ dir })` costs ~21 ms; the whole store costs ~281 ms and holds the projects
   * nobody released ([D-01](../../../../../docs/plans/04-transcript-and-resume/decisions.md)).
   * Worktrees are not followed: a worktree is another path on disk, outside the root asked about.
   */
  list(directory: string): Promise<readonly TranscriptSession[]>;

  /**
   * Every session of the store — for the "include subfolders" filter alone (plan 08, D-05), which
   * then keeps what ran inside the folder by its `cwd`. ~281 ms for 298 sessions, measured: the
   * implementation holds the answer for a short while, and two callers at once share one read.
   */
  listAll(): Promise<readonly TranscriptSession[]>;

  /**
   * One session, or `null` when no transcript has that id.
   *
   * It is what tells "empty" from "absent": the messages come back `[]` in both cases, and only
   * this answers `undefined` for an id that names nothing (S-56).
   */
  find(id: ConversationRef): Promise<TranscriptSession | null>;

  /**
   * Every message of a session, oldest first, as events of our contract.
   *
   * Whole, and not a page: the engine re-parses the entire file on every call whatever `limit` says —
   * measured, ~30 MB of heap with or without one — so slicing is done on a result that is cached
   * by `session.id` and `session.lastModified` (S-64).
   */
  messages(session: TranscriptSession): Promise<readonly TranscriptMessage[]>;

  /**
   * Every message of the subagent the tool `toolUseId` opened, oldest first, as events of our
   * contract — or `null` when the conversation has no subagent of that tool (plan 08, B-21).
   *
   * By the tool and not by the subagent's own id: the tool is what the conversation names, and the
   * id of the subagent is said only in the text of its result. The engine lists the subagents, and the
   * one whose messages hang off that tool is it.
   */
  subagentMessages(
    session: TranscriptSession,
    toolUseId: string,
  ): Promise<readonly TranscriptMessage[] | null>;

  /**
   * The whole output of a tool of the main chain, as text — a result made of blocks is their text
   * joined —, or `null` when the chain has no result of that tool: an id it never had, a call still
   * running, a tool of a subagent (plan 22, B-11). Uncut: the ceiling is the use case's.
   */
  toolResult(session: TranscriptSession, toolUseId: string): Promise<string | null>;

  /**
   * The image a prompt of the main chain carried, by the `blockId` its marker has — or `null` when no
   * image of a prompt has that id (plan 22, B-12).
   */
  promptImage(session: TranscriptSession, blockId: string): Promise<StoredImage | null>;
}

/** An image a prompt carried, as the transcript keeps it: its declared type, and its bytes in base64. */
export interface StoredImage {
  /** The type the prompt declared, or `null` when it declared none. */
  readonly mediaType: string | null;

  /** The bytes, in base64 — as the Messages API took them. */
  readonly data: string;
}

export const TRANSCRIPT_STORE = Symbol('TranscriptStore');

/**
 * The store of one engine: it reads that engine's conversations, and knows the form of their ids
 * (ADR-025). The adapter of each engine implements it; {@link TranscriptStoreRegistry} routes to it.
 */
export interface EngineTranscriptStore extends TranscriptStore {
  readonly engine: EngineId;

  /** The conversation [id] names, or `null` when the engine never hands out such an id. */
  conversationOf(id: string): ConversationRef | null;
}

/** The stores of the engines enabled here, in the order the configuration listed them. */
export const ENGINE_TRANSCRIPT_STORES = Symbol('EngineTranscriptStores');
