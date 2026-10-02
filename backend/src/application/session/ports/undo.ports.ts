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

/** A file the undo wrote, measured — with the hash a baseline records. */
export interface WrittenFile extends RestoredFile {
  readonly hash: string;
}

/**
 * The bytes at a path, as the diffs of a session may read them (plan 08, F3).
 *
 * `unsafe` is read **without reading**: a link, a hard link, anything but a regular file, or a
 * directory that no longer resolves to itself — the same paths the undo will not write through
 * (S-117). `tooLarge` is past the ceiling the caller gave, and was not read either.
 */
export type FileContent =
  | { readonly kind: 'file'; readonly bytes: Uint8Array; readonly hash: string }
  | { readonly kind: 'absent' }
  | { readonly kind: 'tooLarge'; readonly sizeBytes: number }
  | { readonly kind: 'unsafe' };

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

  /** The bytes at a path, in one read — before or after any atomic rename, never between. */
  read(path: string, maxBytes: number): Promise<FileContent>;

  /**
   * The contents a checkpoint kept, verified against the hash taken with them.
   *
   * @throws when there is no blob, it cannot be read, or it is not what was snapshotted
   */
  snapshotOf(checkpoint: TurnFileCheckpoint): Promise<Uint8Array>;

  /**
   * Writes contents over a path — a hunk rejected, a rejection undone — the way {@link restore}
   * does: atomically, and never through a link.
   *
   * @throws when it cannot, and then the path is exactly as it was
   */
  write(path: string, content: Uint8Array): Promise<WrittenFile>;
}

export const UNDO_JOURNAL = Symbol('UndoJournal');
export const UNDO_DISK = Symbol('UndoDisk');
