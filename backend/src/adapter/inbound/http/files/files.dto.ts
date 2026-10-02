import { z } from 'zod';

import type { CreatedEntry, OpenedFile, RelocatedEntry, SavedFile } from '@application/files';
import type { TargetKind, TreeEntry, TreeListing } from '@domain/files';
import { flag, folderPath } from '../workspace/workspace.dto';
import { toHistoryOutcomeDto } from './file-history.dto';
import type { HistoryOutcomeDto } from './file-history.dto';

/**
 * A path inside the open folder, as the routes take it: relative, POSIX, `''` for the folder.
 *
 * Format only — a string of a sane length. Every rule about what it may name is the domain's
 * (`FilePath`): absolute, NUL, backslash and climbing out are refused there, before the disk, with
 * every reason at once (S-18).
 */
const relativePath = z.string().max(4096);

/** A path that names an entry, never the folder itself. */
const entryPath = relativePath.min(1);

/** An encoding by name — whether this server knows it is the use case's question (S-50). */
const encoding = z.string().min(1).max(64);

/** A precondition header's worth of entity tags. */
const entityTag = z.string().min(1).max(512);

/**
 * How a text is written — the encoding it was opened in, whether it carries a byte-order mark — and
 * the second step of a file that changes what Claude may do. A save and a create both send them.
 */
const textOptions = {
  encoding: encoding.default('utf8'),
  bom: z.boolean().default(false),
  confirmSensitive: z.boolean().default(false),
};

/** What `GET /files/tree` is asked: one level of one folder. */
export const treeQuerySchema = z.object({ folder: folderPath, path: relativePath.default('') });

export type TreeQueryDto = z.infer<typeof treeQuerySchema>;

/** What `GET /files/content` is asked; `encoding` is "reopen with encoding". */
export const contentQuerySchema = z.object({
  folder: folderPath,
  path: entryPath,
  encoding: encoding.optional(),
});

export type ContentQueryDto = z.infer<typeof contentQuerySchema>;

/**
 * What `PUT /files/content` is sent. The version it was edited against travels in `If-Match`, as
 * HTTP has it; `encoding` and `bom` are the ones the file was opened with.
 */
export const saveBodySchema = z.object({
  folder: folderPath,
  path: entryPath,
  content: z.string(),
  ...textOptions,
});

export type SaveBodyDto = z.infer<typeof saveBodySchema>;

/** What `POST /files` is sent: a file, with what it starts with, or a folder, with nothing. */
export const createBodySchema = z
  .object({
    folder: folderPath,
    path: entryPath,
    kind: z.enum(['file', 'directory']),
    content: z.string().optional(),
    ...textOptions,
  })
  .refine((body) => body.kind === 'file' || body.content === undefined, {
    path: ['content'],
    message: 'aFolderHasNoContent',
  });

export type CreateBodyDto = z.infer<typeof createBodySchema>;

/** What `POST /files/move` and `POST /files/copy` are sent. */
export const relocateBodySchema = z.object({
  folder: folderPath,
  from: entryPath,
  to: entryPath,
  ifMatch: entityTag.optional(),
  confirmSensitive: z.boolean().default(false),
});

export type RelocateBodyDto = z.infer<typeof relocateBodySchema>;

/**
 * What `DELETE /files` is asked. `expectedEntries` is the count a `409` showed — digits, as a query
 * string carries a number. `keepInHistory` keeps what goes in the local history first (F8), and
 * leaves the definitive delete of F2 exactly as it was when absent.
 */
export const deleteQuerySchema = z.object({
  folder: folderPath,
  path: entryPath,
  recursive: flag,
  expectedEntries: z
    .string()
    .regex(/^(0|[1-9]\d{0,9})$/)
    .transform(Number)
    .optional(),
  confirmSensitive: flag,
  keepInHistory: flag,
});

export type DeleteQueryDto = z.infer<typeof deleteQuerySchema>;

/** One entry of a level of the tree. */
export interface TreeEntryDto {
  readonly name: string;
  /** Relative to the open folder. */
  readonly path: string;
  readonly kind: 'file' | 'directory' | 'symlink' | 'other';
  readonly size: number;
  /** ISO-8601. */
  readonly mtime: string;
  /** One of the names the explorer hides unless "show hidden" is on — marked, never left out. */
  readonly hidden: boolean;
  /** Not UTF-8 on disk: shown, and never operated on. */
  readonly unreadableName: boolean;
  /** A link that leads outside the open folder: not navigable. `false` for anything but a link. */
  readonly outside: boolean;
  /** What a link inside leads to — `missing` when it is broken; `null` outside and for non-links. */
  readonly targetKind: TargetKind | null;
}

/** One level of the tree, never more. */
export interface TreeDto {
  readonly folder: string;
  readonly path: string;
  readonly entries: readonly TreeEntryDto[];
  readonly truncated: boolean;
}

/** A file, opened for the editor. Its version travels in the `ETag` header **and** here. */
export interface FileContentDto {
  readonly path: string;
  readonly content: string;
  readonly etag: string;
  readonly encoding: string;
  readonly bom: boolean;
  readonly eol: 'lf' | 'crlf' | 'mixed';
  readonly size: number;
  readonly mtime: string;
  readonly largeFile: boolean;
}

/** A file as a save left it, and how keeping the version it replaced ended (`null`: nothing written). */
export interface SavedFileDto {
  readonly path: string;
  readonly etag: string;
  readonly size: number;
  readonly history: HistoryOutcomeDto | null;
}

/** An entry a create, a move or a copy left — `etag` for a file, `null` otherwise. */
export interface EntryDto {
  readonly path: string;
  readonly etag: string | null;
}

export function toTreeDto(listing: TreeListing): TreeDto {
  return {
    folder: listing.directory.folder.value,
    path: listing.directory.relative,
    entries: listing.entries.map(toTreeEntryDto),
    truncated: listing.truncated,
  };
}

function toTreeEntryDto(entry: TreeEntry): TreeEntryDto {
  return {
    name: entry.name,
    path: entry.path,
    kind: entry.kind,
    size: entry.size,
    mtime: entry.mtime.toISOString(),
    hidden: entry.hidden,
    unreadableName: entry.unreadableName,
    outside: entry.symlink?.outside ?? false,
    targetKind: entry.symlink?.targetKind ?? null,
  };
}

export function toFileContentDto(file: OpenedFile): FileContentDto {
  return {
    path: file.path.relative,
    content: file.content,
    etag: file.etag.value,
    encoding: file.encoding,
    bom: file.bom,
    eol: file.eol,
    size: file.size,
    mtime: file.mtime.toISOString(),
    largeFile: file.largeFile,
  };
}

export function toSavedFileDto(saved: SavedFile): SavedFileDto {
  return {
    path: saved.path.relative,
    etag: saved.etag.value,
    size: saved.size,
    history: toHistoryOutcomeDto(saved.history),
  };
}

export function toEntryDto(entry: CreatedEntry | RelocatedEntry): EntryDto {
  return { path: entry.path.relative, etag: entry.etag?.value ?? null };
}
