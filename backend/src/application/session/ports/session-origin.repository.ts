import type { UserId } from '@domain/auth';
import type { SessionId } from '@domain/session';
import type { ClaudeSessionId } from '@domain/transcript';
import type { WorkspacePath } from '@domain/workspace';

/**
 * That **we** opened a conversation of Claude, for whom, and where.
 *
 * Provenance and nothing else: no message, no summary, not a line of the transcript. The SDK
 * reports no origin for a session, and this row is the only way to tell one this backend opened
 * from one the editor or the terminal did (docs/architecture/backend/05-persistence.md).
 */
export interface SessionOrigin {
  /** The name of the transcript, and what `resume` takes. */
  readonly claudeSessionId: ClaudeSessionId;

  /** Our own id for the live session that opened it. */
  readonly sessionId: SessionId;

  readonly openedBy: UserId;
  readonly workspace: WorkspacePath;
  readonly openedAt: Date;
}

/**
 * Where the provenance of our sessions is kept.
 *
 * Written once per session this backend opens, before anything is spawned; read by `transcript`,
 * through a port of its own, to label a conversation and to keep another person's out of reach.
 */
export interface SessionOriginRepository {
  /** Records it. Recording the same `claudeSessionId` twice keeps the first record. */
  record(origin: SessionOrigin): Promise<void>;

  /** Who opened each of these here. An id this backend never opened is absent from the map. */
  openersOf(ids: readonly ClaudeSessionId[]): Promise<ReadonlyMap<string, UserId>>;
}

export const SESSION_ORIGIN_REPOSITORY = Symbol('SessionOriginRepository');

/**
 * Where the id of a new conversation of Claude comes from — a UUID, which the SDK requires.
 *
 * Minted by us rather than read back from the SDK's `system:init`, so the provenance exists
 * **before** the subprocess does: a record written after the fact leaves a window in which a
 * transcript of ours is on disk and reads as somebody else's.
 */
export const CLAUDE_SESSION_ID_GENERATOR = Symbol('ClaudeSessionIdGenerator');
