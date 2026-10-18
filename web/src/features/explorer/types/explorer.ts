import type {
  FileEntryPayload,
  FileTreePayload,
  FileTreePayloadEntriesItem,
} from '@remote-claude/contracts';

import type { AppError } from '@/shared/api/errors';

/** A failure, as the explorer's hooks hand it to its components — never an HTTP status. */
export type ExplorerError = AppError;

/** What an entry of the tree is on disk. */
export type EntryKind = TreeEntry['kind'];

/** What a link inside the folder leads to — `missing` when it is broken. */
export type TargetKind = NonNullable<TreeEntry['targetKind']>;

/** One entry of one level of the tree, as `GET /files/tree` answers it (plan 28, B-48). */
export type TreeEntry = FileTreePayloadEntriesItem;

/**
 * One level of the tree, as the server listed it — `FileTreePayload` without `folder`, which the
 * service already knows (every call names the folder of the tab) and does not carry past itself.
 */
export type DirectoryListing = Omit<FileTreePayload, 'folder'>;

/**
 * What a create, a move or a copy left: the path, and the version of a file, as `POST /files`,
 * `POST /files/move` and `POST /files/copy` answer it (plan 28, B-48).
 */
export type WrittenEntry = FileEntryPayload;

/** How the entries of a level are ordered — folders first, always. */
export type SortOrder = 'name' | 'type' | 'modified';

export const SORT_ORDERS: readonly SortOrder[] = ['name', 'type', 'modified'];

/** What a new entry is. */
export type NewEntryKind = 'file' | 'directory';
