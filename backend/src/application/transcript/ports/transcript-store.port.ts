import type { ClaudeSessionId, TranscriptMessage, TranscriptSession } from '@domain/transcript';

/**
 * Claude's own store of conversations, read — never written, never parsed by us.
 *
 * The one implementation calls `listSessions`, `getSessionInfo` and `getSessionMessages` of the
 * Agent SDK. The JSONL behind them is internal to Claude Code, changes without notice and is the
 * same file the editor uses; a parser of our own would break on the next SDK release, silently
 * (docs/architecture/backend/03-modules.md#transcript). `pnpm lint:arch` holds the line: nothing
 * in this module may reach for the filesystem.
 *
 * Every method throws `TranscriptUnavailableError` when the SDK fails and `TranscriptTimeoutError`
 * when it does not answer in time — never a raw error of the SDK.
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
   * One session, or `null` when no transcript has that id.
   *
   * It is what tells "empty" from "absent": the messages come back `[]` in both cases, and only
   * this answers `undefined` for an id that names nothing (S-56).
   */
  find(id: ClaudeSessionId): Promise<TranscriptSession | null>;

  /**
   * Every message of a session, oldest first, as events of our contract.
   *
   * Whole, and not a page: the SDK re-parses the entire file on every call whatever `limit` says —
   * measured, ~30 MB of heap with or without one — so slicing is done on a result that is cached
   * by `session.id` and `session.lastModified` (S-64).
   */
  messages(session: TranscriptSession): Promise<readonly TranscriptMessage[]>;
}

export const TRANSCRIPT_STORE = Symbol('TranscriptStore');
