import type { UserId } from '@domain/auth';

/**
 * What the local history keeps, and the rules it is kept by — plan 07, F8
 * ([D-17](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-17--o-histórico-local)).
 *
 * The history is **per path**: a move never overwrites (D-12), so no version is lost by one, and a
 * renamed file does not take its versions along. Only the person's writes enter — Claude's have the
 * undo store of the session, and two copies of one fact diverge.
 */

/** Why a version was kept: the write that was about to lose it. */
export const HISTORY_REASONS = ['save', 'delete', 'restore', 'upload'] as const;

export type HistoryReason = (typeof HISTORY_REASONS)[number];

/** Whether the contents are in the store, or why not — the entry exists either way, and says so. */
export type HistoryKept = 'yes' | 'tooLarge';

/** A file, with contents; or a folder of a delete, without — so even an empty one comes back. */
export type HistoryEntryKind = 'file' | 'directory';

/** Why a version did not enter the history: past the snapshot ceiling, or the store failed. */
export type NotKeptReason = 'tooLarge' | 'unavailable';

/** Why a folder did not: one more — more entries than one delete may keep. */
export type FolderNotKeptReason = NotKeptReason | 'tooMany';

/** One version, as the store holds it. Never the contents: those are a blob, named by `hash`. */
export interface HistoryEntry {
  readonly id: string;
  /** What orders the entries — two land in the same millisecond, and a clock can be set back. */
  readonly seq: number;
  /** Who wrote over it: the `sub`, the one thing the server knows of a person. */
  readonly userId: UserId;
  /** The real path — the subject, as in the trail. */
  readonly path: string;
  /** Relative to the folder of the write — how it was named then. */
  readonly label: string;
  readonly entryKind: HistoryEntryKind;
  /** SHA-256 in hex; `null` for a folder. */
  readonly hash: string | null;
  /** `null` for a folder. */
  readonly sizeBytes: number | null;
  readonly reason: HistoryReason;
  readonly kept: HistoryKept;
  /** What joins the items of one delete, so its undo brings them all back; `null` otherwise. */
  readonly batchId: string | null;
  readonly createdAt: Date;
}

/** Whether a file of `sizeBytes` is kept, by the snapshot ceiling (S-333). */
export function keptFor(sizeBytes: number, maxFileBytes: number): HistoryKept {
  return sizeBytes > maxFileBytes ? 'tooLarge' : 'yes';
}

/** Whether an entry has contents to read back. */
export function hasContents(entry: HistoryEntry): boolean {
  return entry.entryKind === 'file' && entry.kept === 'yes';
}

/** Who wrote the version, as the caller sees it (S-350). */
export function authorOf(entry: HistoryEntry, caller: UserId): { self: boolean; id: string } {
  return { self: entry.userId.equals(caller), id: entry.userId.value };
}

/** One distinct blob the store holds: its size, and the newest entry that still names it. */
export interface StoredBlob {
  readonly sizeBytes: number;
  readonly newestSeq: number;
}

/**
 * How far the purge of the total goes: every kept entry up to the returned `seq` is removed, the
 * oldest first, until what is left fits — `null` when it already does (S-331).
 *
 * The total is of **distinct** blobs — the same contents kept ten times weigh once — so removing an
 * entry frees nothing until the newest entry of its blob goes. Walking the blobs by that newest
 * entry, oldest first, is walking the entries oldest first and counting only what each removal
 * actually frees; a blob another entry still names is never counted as freed, and never deleted.
 */
export function storeCutoff(blobs: readonly StoredBlob[], maxStoreBytes: number): number | null {
  const total = blobs.reduce((sum, blob) => sum + blob.sizeBytes, 0);

  if (total <= maxStoreBytes) {
    return null;
  }

  const byAge = [...blobs].sort((left, right) => left.newestSeq - right.newestSeq);
  let left = total;
  let cutoff: number | null = null;

  for (const blob of byAge) {
    cutoff = blob.newestSeq;
    left -= blob.sizeBytes;

    if (left <= maxStoreBytes) {
      break;
    }
  }

  return cutoff;
}
