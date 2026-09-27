import type {
  FileObservation,
  SessionFileState,
  SessionId,
  TurnFileCheckpoint,
} from '@domain/session';
import type { ClaudeSessionId } from '@domain/transcript';

/**
 * What an undo reaches: the checkpoints of this live session, and of every earlier session that
 * **was** the same conversation — one of ours continued in place.
 *
 * Never more. A fork is a new conversation and reaches nothing of the one it continues, which is
 * what the SDK does too ([D-04](../../../../../docs/plans/04-transcript-and-resume/decisions.md#d-04--duas-bocas-no-mesmo-arquivo)).
 */
export interface UndoReach {
  readonly sessionId: SessionId;
  readonly claudeSessionId: ClaudeSessionId;
}

/** How the file itself was measured, once the undo has put it back. */
export interface RestoredFile {
  readonly mtime: Date;
  readonly sizeBytes: number;
}

/**
 * The journal, as the undo reads it — and the one thing the undo writes back into it.
 *
 * The baseline is written back because the undo is itself a write of the session: without it, a
 * second undo to an earlier point would read the file the first one restored as somebody else's
 * edit, and preserve it.
 */
export interface UndoJournal {
  /** Every snapshot the reach recorded, of every turn. */
  checkpointsOf(reach: UndoReach): Promise<readonly TurnFileCheckpoint[]>;

  /** How each session of the reach left each path it wrote — several rows per path, possibly. */
  baselinesOf(reach: UndoReach): Promise<readonly SessionFileState[]>;

  /** Records how the undo left a path, as the session's own baseline. */
  recordBaseline(state: SessionFileState): Promise<void>;

  /**
   * The live sessions whose snapshots a purge must keep: those given, and every earlier session of
   * their conversations.
   */
  reachOf(live: readonly UndoReach[]): Promise<ReadonlySet<string>>;
}

/**
 * The disk, as the undo is allowed to touch it.
 *
 * Every write is **atomic per file** — a temporary beside it, then a rename — so a failure halfway
 * never leaves a file truncated, which would be worse than not having reverted it (S-66). And it
 * never writes through a link: {@link observe} says `unsafe`, and the undo leaves the path alone
 * (S-65).
 */
export interface UndoDisk {
  /** What is at a path now: a regular file and its hash, nothing, or something it will not touch. */
  observe(path: string): Promise<FileObservation>;

  /**
   * Puts the snapshot back over the path.
   *
   * @throws when the snapshot cannot be read or the file cannot be written — and then the path is
   *   exactly as it was
   */
  restore(checkpoint: TurnFileCheckpoint): Promise<RestoredFile>;

  /** Removes a file the undone turn created. @throws when it cannot, and then nothing changed */
  remove(path: string): Promise<void>;
}

export const UNDO_JOURNAL = Symbol('UndoJournal');
export const UNDO_DISK = Symbol('UndoDisk');
