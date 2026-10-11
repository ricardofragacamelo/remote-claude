import type { UserId } from '@domain/auth';
import type { ConversationRef } from '@domain/engine';
import type { SessionId } from '@domain/session';
import type { WorkspacePath } from '@domain/workspace';

/**
 * That **we** opened a conversation of a coding agent, for whom, and where.
 *
 * Provenance and nothing else: no message, no summary, not a line of the transcript. The engine
 * reports no origin for a conversation, and this row is the only way to tell one this backend opened
 * from one the editor or the terminal did (docs/architecture/backend/05-persistence.md).
 */
export interface SessionOrigin {
  /** The conversation, `{ engine, id }` — what the history reads and a resume takes. */
  readonly conversation: ConversationRef;

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
  /** Records it. Recording the same conversation twice keeps the first record. */
  record(origin: SessionOrigin): Promise<void>;

  /**
   * Who opened each of these here, by {@link ConversationRef.key}. A conversation this backend never
   * opened is absent from the map.
   */
  openersOf(ids: readonly ConversationRef[]): Promise<ReadonlyMap<string, UserId>>;
}

export const SESSION_ORIGIN_REPOSITORY = Symbol('SessionOriginRepository');
