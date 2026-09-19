import { SessionFileState, SessionId, TurnFileCheckpoint } from '@domain/session';
import type { FilePresence, Restorability } from '@domain/session';
import type { sessionFileStates, turnFileCheckpoints } from '@infra/database/schema';

type StateRow = typeof sessionFileStates.$inferSelect;
type StateInsert = typeof sessionFileStates.$inferInsert;
type CheckpointRow = typeof turnFileCheckpoints.$inferSelect;
type CheckpointInsert = typeof turnFileCheckpoints.$inferInsert;

/** A row of `session_file_states`, as the entity. */
export function toStateEntity(row: StateRow): SessionFileState {
  return SessionFileState.record({
    sessionId: SessionId.create(row.sessionId),
    path: row.path,
    hash: row.hash,
    mtime: row.mtime,
    sizeBytes: row.sizeBytes,
    updatedAt: row.updatedAt,
  });
}

/** The entity, as a row. */
export function toStateRow(state: SessionFileState): StateInsert {
  const snapshot = state.snapshot();

  return {
    sessionId: snapshot.sessionId.value,
    path: snapshot.path,
    hash: snapshot.hash,
    mtime: snapshot.mtime,
    sizeBytes: snapshot.sizeBytes,
    updatedAt: snapshot.updatedAt,
  };
}

/** A row of `turn_file_checkpoints`, as the entity. */
export function toCheckpointEntity(row: CheckpointRow): TurnFileCheckpoint {
  return TurnFileCheckpoint.capture({
    sessionId: SessionId.create(row.sessionId),
    promptId: row.promptId,
    path: row.path,
    existedBefore: row.existedBefore as FilePresence,
    blobPath: row.blobPath,
    hash: row.hash,
    sizeBytes: row.sizeBytes,
    restorable: row.restorable as Restorability,
    promptText: row.promptText,
    capturedAt: row.capturedAt,
  });
}

/** The entity, as a row. */
export function toCheckpointRow(checkpoint: TurnFileCheckpoint): CheckpointInsert {
  const snapshot = checkpoint.snapshot();

  return {
    sessionId: snapshot.sessionId.value,
    promptId: snapshot.promptId,
    path: snapshot.path,
    existedBefore: snapshot.existedBefore,
    blobPath: snapshot.blobPath,
    hash: snapshot.hash,
    sizeBytes: snapshot.sizeBytes,
    restorable: snapshot.restorable,
    promptText: snapshot.promptText,
    capturedAt: snapshot.capturedAt,
  };
}
