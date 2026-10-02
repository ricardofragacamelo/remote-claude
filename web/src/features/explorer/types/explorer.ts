import type { AppError } from '@/shared/api/errors';

/** A failure, as the explorer's hooks hand it to its components — never an HTTP status. */
export type ExplorerError = AppError;

/** What an entry of the tree is on disk. */
export type EntryKind = 'file' | 'directory' | 'symlink' | 'other';

/** What a link inside the folder leads to — `missing` when it is broken. */
export type TargetKind = 'file' | 'directory' | 'other' | 'missing';

/** One entry of one level of the tree. */
export interface TreeEntry {
  readonly name: string;

  /** Relative to the open folder, POSIX. */
  readonly path: string;
  readonly kind: EntryKind;
  readonly size: number;

  /** ISO 8601. */
  readonly mtime: string;

  /** One of the names "show hidden" reveals (07 · D-10) — marked by the server, never left out. */
  readonly hidden: boolean;

  /** Not UTF-8 on disk: shown, and never acted on. */
  readonly unreadableName: boolean;

  /** A link that leads out of the open folder: marked, and never opened. */
  readonly outside: boolean;

  /** What a link inside leads to; `null` outside and for anything that is not a link. */
  readonly targetKind: TargetKind | null;
}

/** One level of the tree, as the server listed it. */
export interface DirectoryListing {
  /** Relative to the open folder; `''` is the folder itself. */
  readonly path: string;
  readonly entries: readonly TreeEntry[];

  /** More entries than the ceiling of a level: the rest are not listed (07 · D-10). */
  readonly truncated: boolean;
}

/** What a create, a move or a copy left: the path, and the version of a file. */
export interface WrittenEntry {
  readonly path: string;
  readonly etag: string | null;
}

/** How the entries of a level are ordered — folders first, always. */
export type SortOrder = 'name' | 'type' | 'modified';

export const SORT_ORDERS: readonly SortOrder[] = ['name', 'type', 'modified'];

/** What a new entry is. */
export type NewEntryKind = 'file' | 'directory';
