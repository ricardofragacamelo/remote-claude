import { z } from 'zod';

import type {
  FileContentPayload,
  FileEntryPayload,
  FileTreePayload,
  SavedFilePayload,
} from '@remote-claude/contracts';

import type { CreatedEntry, OpenedFile, RelocatedEntry, SavedFile } from '@application/files';
import type { TreeEntry, TreeListing } from '@domain/files';
import { flag, folderPath } from '../workspace/workspace.dto';
import { toHistoryOutcomeDto } from './file-history.dto';

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
 * the second step of a file that changes what the agent may do. A save and a create both send them.
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

function toTreeEntryDto(entry: TreeEntry): FileTreePayload['entries'][number] {
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

export function toTreeDto(listing: TreeListing): FileTreePayload {
  return {
    folder: listing.directory.folder.value,
    path: listing.directory.relative,
    entries: listing.entries.map(toTreeEntryDto),
    truncated: listing.truncated,
  };
}

export function toFileContentDto(file: OpenedFile): FileContentPayload {
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

export function toSavedFileDto(saved: SavedFile): SavedFilePayload {
  return {
    path: saved.path.relative,
    etag: saved.etag.value,
    size: saved.size,
    history: toHistoryOutcomeDto(saved.history),
  };
}

export function toEntryDto(entry: CreatedEntry | RelocatedEntry): FileEntryPayload {
  return { path: entry.path.relative, etag: entry.etag?.value ?? null };
}
