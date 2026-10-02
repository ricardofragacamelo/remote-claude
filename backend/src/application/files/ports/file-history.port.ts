import type { UserId } from '@domain/auth';
import type { HistoryEntry, HistoryReason } from '@domain/files';

/**
 * What a version is, before it is kept: a file whose bytes the store reads **inside** its keeping
 * — so a delete of a thousand files never holds a thousand files in memory at once —, a file past
 * the snapshot ceiling, kept as metadata only, or a folder of a delete.
 */
export type KeptContents =
  | { readonly kind: 'file'; read(): Promise<Uint8Array> }
  | { readonly kind: 'tooLarge'; readonly hash: string; readonly sizeBytes: number }
  | { readonly kind: 'directory' };

/** A version about to be kept: everything the entry says, but its hash and size, which the bytes do. */
export interface VersionToKeep {
  readonly id: string;
  readonly userId: UserId;
  /** The real path. */
  readonly path: string;
  /** Relative to the folder of the write. */
  readonly label: string;
  readonly reason: HistoryReason;
  readonly batchId: string | null;
  readonly createdAt: Date;
  readonly contents: KeptContents;
}

/** Which entries a page is of: one path's versions, or everything under a folder. */
export type HistoryScope =
  | { readonly kind: 'path'; readonly path: string }
  | { readonly kind: 'under'; readonly folder: string };

/** One page of entries, newest first. */
export interface HistoryPageQuery {
  readonly scope: HistoryScope;
  readonly reason: HistoryReason | null;
  /** The `seq` the page starts below — the last one of the previous page; `null` for the first. */
  readonly before: number | null;
  readonly limit: number;
}

/**
 * The local history: the rows of `file_history_entries` and the blobs they name, as one store —
 * plan 07, B-56 ([D-17](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-17--o-histórico-local)).
 *
 * One port and not two, because the two halves are only safe together: a blob is written and the
 * row that names it inserted under one lock, which the purge takes exclusively, so its sweep never
 * deletes a blob a row is about to name. The ceilings — per path, total, age — are the store's to
 * keep, as the snapshot store keeps its own.
 */
export interface FileHistoryStore {
  /**
   * Keeps every version, or none: a failure halfway — a file that grew past the ceiling, a disk that
   * refused — keeps nothing. The versions of each path past the ceiling per file go, the oldest
   * first, in the same keeping (S-331).
   *
   * @returns the entries, in the order given
   * @throws whatever reading a file threw — {@link import('@domain/files').FileTooLargeError} among
   *   them —, or the store's own failure
   */
  keep(versions: readonly VersionToKeep[]): Promise<readonly HistoryEntry[]>;

  /** Forgets the entries of a delete that did not go ahead after all. Their blobs go with the sweep. */
  discard(batchId: string): Promise<void>;

  /** One entry by id, whoever wrote it; `null` when it is not there. */
  find(id: string): Promise<HistoryEntry | null>;

  /** The kept bytes of an entry; `null` for one without, or whose blob is gone. */
  contents(entry: HistoryEntry): Promise<Uint8Array | null>;

  /** At most `limit` entries of the scope, newest first. */
  page(query: HistoryPageQuery): Promise<readonly HistoryEntry[]>;

  /**
   * The latest `delete` entry of each path under `folder`, newest first, at most `limit` — whether
   * the path exists again is the caller's question, asked of the disk.
   */
  latestDeletes(
    folder: string,
    before: number | null,
    limit: number,
  ): Promise<readonly HistoryEntry[]>;
}

export const FILE_HISTORY_STORE = Symbol('FileHistoryStore');
