import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull, or } from 'drizzle-orm';

import { SessionFileState, TurnFileCheckpoint } from '@domain/session';
import type { SessionId } from '@domain/session';
import type { ClaudeSessionId } from '@domain/transcript';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { sessionFileStates, turnFileCheckpoints } from '@infra/database/schema';
import { runLogged } from '../query-logging';
import {
  toCheckpointEntity,
  toCheckpointRow,
  toStateEntity,
  toStateRow,
} from './session-file.mapper';

/**
 * `session_file_states` and `turn_file_checkpoints`, in PostgreSQL.
 *
 * Two tables and one repository, because they are one aggregate in practice: nothing reads a
 * checkpoint without also asking how the session left the file, and splitting them would mean two
 * round trips for every question undo asks.
 */
@Injectable()
export class DrizzleSessionFileRepository {
  constructor(@Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext) {}

  /** Records how the session left a file, replacing whatever it said before. */
  async saveState(state: SessionFileState): Promise<void> {
    const row = toStateRow(state);

    await runLogged(
      this.context.logger,
      'sessionFile.saveState',
      this.context.db
        .insert(sessionFileStates)
        .values(row)
        .onConflictDoUpdate({
          target: [sessionFileStates.sessionId, sessionFileStates.path],
          set: {
            claudeSessionId: row.claudeSessionId,
            hash: row.hash,
            mtime: row.mtime,
            sizeBytes: row.sizeBytes,
            updatedAt: row.updatedAt,
          },
        }),
    );
  }

  /**
   * Writes the snapshot of a path, **unless** this turn already has one for it.
   *
   * `onConflictDoNothing` and not an upsert: the first touch of the turn is the state the undo
   * point means, and a later one would replace it with an intermediate state. Doing it in one
   * statement rather than as read-then-write also settles the concurrent case — two tools touching
   * the same path at once leave one row, chosen by the database rather than by a race.
   */
  async saveCheckpointIfAbsent(checkpoint: TurnFileCheckpoint): Promise<void> {
    await runLogged(
      this.context.logger,
      'sessionFile.saveCheckpoint',
      this.context.db
        .insert(turnFileCheckpoints)
        .values(toCheckpointRow(checkpoint))
        .onConflictDoNothing({
          target: [
            turnFileCheckpoints.sessionId,
            turnFileCheckpoints.promptId,
            turnFileCheckpoints.path,
          ],
        }),
    );
  }

  /** How the session left each file it wrote. */
  async statesOf(sessionId: SessionId): Promise<readonly SessionFileState[]> {
    const rows = await runLogged(
      this.context.logger,
      'sessionFile.statesOf',
      this.context.db
        .select()
        .from(sessionFileStates)
        .where(eq(sessionFileStates.sessionId, sessionId.value)),
    );

    return rows.map(toStateEntity);
  }

  /** Every path one turn touched, with what it held before. */
  async checkpointsOf(
    sessionId: SessionId,
    promptId: string,
  ): Promise<readonly TurnFileCheckpoint[]> {
    const rows = await runLogged(
      this.context.logger,
      'sessionFile.checkpointsOf',
      this.context.db
        .select()
        .from(turnFileCheckpoints)
        .where(
          and(
            eq(turnFileCheckpoints.sessionId, sessionId.value),
            eq(turnFileCheckpoints.promptId, promptId),
          ),
        ),
    );

    return rows.map(toCheckpointEntity);
  }

  /**
   * Every snapshot of a live session **and** of the earlier sessions that were the same conversation.
   *
   * By the conversation, because one of ours continued in place is a new live session on the same
   * conversation; by the session too, because the rows written before migration `0013` name no
   * conversation and are still this session's.
   */
  async checkpointsOfConversation(
    sessionId: SessionId,
    claudeSessionId: ClaudeSessionId,
  ): Promise<readonly TurnFileCheckpoint[]> {
    const rows = await runLogged(
      this.context.logger,
      'sessionFile.checkpointsOfConversation',
      this.context.db
        .select()
        .from(turnFileCheckpoints)
        .where(
          or(
            eq(turnFileCheckpoints.claudeSessionId, claudeSessionId.value),
            eq(turnFileCheckpoints.sessionId, sessionId.value),
          ),
        ),
    );

    return rows.map(toCheckpointEntity);
  }

  /** How each session of the conversation left each path — several rows per path, possibly. */
  async statesOfConversation(
    sessionId: SessionId,
    claudeSessionId: ClaudeSessionId,
  ): Promise<readonly SessionFileState[]> {
    const rows = await runLogged(
      this.context.logger,
      'sessionFile.statesOfConversation',
      this.context.db
        .select()
        .from(sessionFileStates)
        .where(
          or(
            eq(sessionFileStates.claudeSessionId, claudeSessionId.value),
            eq(sessionFileStates.sessionId, sessionId.value),
          ),
        ),
    );

    return rows.map(toStateEntity);
  }

  /**
   * The sessions whose snapshots belong to any of these conversations.
   *
   * What a purge must keep for a live session: its own snapshots, and those of the earlier sessions
   * of its conversation, which its undo still reaches.
   */
  async sessionsOfConversations(claudeSessionIds: readonly string[]): Promise<readonly string[]> {
    if (claudeSessionIds.length === 0) {
      return [];
    }

    const rows = await runLogged(
      this.context.logger,
      'sessionFile.sessionsOfConversations',
      this.context.db
        .selectDistinct({ sessionId: turnFileCheckpoints.sessionId })
        .from(turnFileCheckpoints)
        .where(
          and(
            isNotNull(turnFileCheckpoints.claudeSessionId),
            inArray(turnFileCheckpoints.claudeSessionId, [...claudeSessionIds]),
          ),
        ),
    );

    return rows.map((row) => row.sessionId);
  }

  /** Forgets the snapshots of sessions a purge removed from disk, so no row points at nothing. */
  async forgetCheckpoints(sessionIds: readonly string[]): Promise<void> {
    if (sessionIds.length === 0) {
      return;
    }

    await runLogged(
      this.context.logger,
      'sessionFile.forgetCheckpoints',
      this.context.db
        .delete(turnFileCheckpoints)
        .where(inArray(turnFileCheckpoints.sessionId, [...sessionIds])),
    );
  }
}
