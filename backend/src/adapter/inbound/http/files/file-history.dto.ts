import { z } from 'zod';

import type {
  HistoryOutcome,
  HistoryPagePayload,
  KeptDeletePayload,
  RestoredEntryPayload,
} from '@remote-claude/contracts';

import type {
  FileKeeping,
  HistoryPage,
  KeptBatch,
  RestoredEntry,
  VisibleEntry,
} from '@application/files';
import type { UserId } from '@domain/auth';
import { Etag, HISTORY_REASONS, authorOf } from '@domain/files';
import { DEFAULT_PAGE_SIZE, pageQuery } from '../audit/audit.dto';
import { flag, folderPath } from '../workspace/workspace.dto';

/** How many entries a page of the history holds when the client does not say. */
export const HISTORY_PAGE_SIZE = DEFAULT_PAGE_SIZE;

/**
 * What `GET /files/history` is asked: one path's versions (`path`), everything under the folder
 * (no `path`), or the recently deleted (`deleted=true`, which ignores the other two). The cursor is
 * opaque to the client — a `seq` here, as in the trails.
 */
export const historyQuerySchema = z.object({
  folder: folderPath,
  path: z.string().min(1).max(4096).optional(),
  reason: z.enum(HISTORY_REASONS).optional(),
  deleted: flag,
  ...pageQuery,
});

export type HistoryQueryDto = z.infer<typeof historyQuerySchema>;

/** An entry's id, as a URL segment carries it: a ULID's alphabet, of a sane length. */
export const historyEntryIdSchema = z.string().regex(/^[0-9A-Za-z]{1,64}$/);

/** What `GET /files/history/:entryId/content` is asked. */
export const historyContentQuerySchema = z.object({
  folder: folderPath,
  encoding: z.string().min(1).max(64).optional(),
});

export type HistoryContentQueryDto = z.infer<typeof historyContentQuerySchema>;

/** What `POST /files/history/:entryId/restore` is sent; the current version travels in `If-Match`. */
export const restoreBodySchema = z.object({
  folder: folderPath,
  confirmSensitive: z.boolean().default(false),
});

export type RestoreBodyDto = z.infer<typeof restoreBodySchema>;

export function toHistoryPageDto(page: HistoryPage, caller: UserId): HistoryPagePayload {
  return {
    entries: page.entries.map((visible) => toHistoryEntryDto(visible, caller)),
    nextCursor: page.nextCursor,
  };
}

function toHistoryEntryDto(
  { entry, path }: VisibleEntry,
  caller: UserId,
): HistoryPagePayload['entries'][number] {
  return {
    id: entry.id,
    path: path.relative,
    entryKind: entry.entryKind,
    reason: entry.reason,
    kept: entry.kept,
    sizeBytes: entry.sizeBytes,
    hash: entry.hash === null ? null : Etag.ofDigest(entry.hash).value,
    author: authorOf(entry, caller),
    at: entry.createdAt.toISOString(),
    batchId: entry.batchId,
  };
}

export function toHistoryOutcomeDto(keeping: FileKeeping | null): HistoryOutcome | null {
  return keeping === null ? null : toKeepingDto(keeping);
}

/** One keeping that did happen — a replace of an upload always has one. */
export function toKeepingDto(keeping: FileKeeping): HistoryOutcome {
  return keeping.kept
    ? { kept: true, entryId: keeping.entryId }
    : { kept: false, reason: keeping.reason };
}

export function toKeptDeleteDto(batch: KeptBatch): KeptDeletePayload {
  return {
    kept: {
      batchId: batch.batchId,
      entries: batch.entries.map((entry) => ({
        id: entry.id,
        path: entry.label,
        entryKind: entry.entryKind,
      })),
    },
  };
}

export function toRestoredEntryDto(restored: RestoredEntry): RestoredEntryPayload {
  return {
    path: restored.path.relative,
    etag: restored.etag?.value ?? null,
    size: restored.size,
    written: restored.written,
    history: toHistoryOutcomeDto(restored.history),
  };
}
