import type { AppError } from '@/shared/api/errors';

/**
 * Why a version was kept: the write that would have lost it — a save, a delete, a restore, an
 * upload over the file (07 · B-55). Moving never loses a version, so there is no `move`.
 */
export const HISTORY_REASONS = ['save', 'delete', 'restore', 'upload'] as const;

export type HistoryReason = (typeof HISTORY_REASONS)[number];

/** Who wrote the version: the person asking, or somebody else who reaches the same folder (D-17). */
export interface HistoryAuthor {
  readonly self: boolean;

  /** The identity the server knows — the token's subject, never a name. */
  readonly id: string;
}

/** One version of the local history, as the Timeline shows it. */
export interface HistoryEntry {
  readonly id: string;

  /** Relative to the folder, POSIX — the history is by path, and does not follow a rename. */
  readonly path: string;
  readonly entryKind: 'file' | 'directory';
  readonly reason: HistoryReason;

  /** `tooLarge`: above the ceiling of a snapshot — the fact is kept, the content is not. */
  readonly kept: 'yes' | 'tooLarge';
  readonly sizeBytes: number | null;
  readonly author: HistoryAuthor;

  /** ISO 8601. */
  readonly at: string;

  /** The delete it came from, for every entry of one delete — `null` otherwise. */
  readonly batchId: string | null;
}

/** One page of versions, newest first. */
export interface HistoryPage {
  readonly entries: readonly HistoryEntry[];

  /** Where the next page starts — `null` on the last one. */
  readonly nextCursor: string | null;
}

/** One entry a delete kept, as its `200` lists it — what the "Undo" of the delete restores. */
export interface KeptEntry {
  readonly id: string;
  readonly path: string;
  readonly entryKind: 'file' | 'directory';
}

/** What a restore left on disk. */
export interface RestoredEntry {
  readonly path: string;

  /** `null` for a folder. */
  readonly etag: string | null;

  /** `false`: the disk already had that version, and nothing was written. */
  readonly written: boolean;
}

/** How one entry of an undone delete went — the explorer's outcome screen reads it as its own. */
export type RestoreResult =
  | { readonly path: string; readonly ok: true }
  | { readonly path: string; readonly ok: false; readonly error: AppError };

/** The ceilings of the local history the server says — what the help tells. */
export interface HistoryLimits {
  /** A file larger than this is not kept: the entry says so (`kept: tooLarge`). */
  readonly historyMaxFileBytes: number;
}
