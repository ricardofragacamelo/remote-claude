import { z } from 'zod';

import type {
  FileKeeping,
  HistoryPage,
  KeptBatch,
  RestoredEntry,
  VisibleEntry,
} from '@application/files';
import type { UserId } from '@domain/auth';
import { Etag, HISTORY_REASONS, authorOf } from '@domain/files';
import type { HistoryEntryKind, HistoryKept, HistoryReason } from '@domain/files';
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

/** One version, as the Timeline shows it. Never the contents. */
export interface HistoryEntryDto {
  readonly id: string;
  /** Relative to the folder asked. */
  readonly path: string;
  readonly entryKind: HistoryEntryKind;
  readonly reason: HistoryReason;
  readonly kept: HistoryKept;
  readonly sizeBytes: number | null;
  /** In the form of an `ETag`, so a client compares it with the current file's as it is. */
  readonly hash: string | null;
  /** The server only knows the `sub` of whoever wrote: `self` says whether it is the caller. */
  readonly author: { readonly self: boolean; readonly id: string };
  /** ISO-8601. */
  readonly at: string;
  readonly batchId: string | null;
}

export interface HistoryPageDto {
  readonly entries: readonly HistoryEntryDto[];
  /** Opaque to the client: send it back as `cursor`. `null` on the last page. */
  readonly nextCursor: string | null;
}

/** How keeping the replaced version ended, as a save and a restore answer it. */
export type HistoryOutcomeDto =
  | { readonly kept: true; readonly entryId: string }
  | { readonly kept: false; readonly reason: 'tooLarge' | 'unavailable' };

/** What a delete with `keepInHistory` kept, for the client's **Undo**. */
export interface KeptDeleteDto {
  readonly kept: {
    readonly batchId: string;
    readonly entries: readonly {
      readonly id: string;
      readonly path: string;
      readonly entryKind: HistoryEntryKind;
    }[];
  };
}

/** What a restore left: `etag` and `size` `null` for a folder. */
export interface RestoredEntryDto {
  readonly path: string;
  readonly etag: string | null;
  readonly size: number | null;
  readonly written: boolean;
  readonly history: HistoryOutcomeDto | null;
}

export function toHistoryPageDto(page: HistoryPage, caller: UserId): HistoryPageDto {
  return {
    entries: page.entries.map((visible) => toHistoryEntryDto(visible, caller)),
    nextCursor: page.nextCursor,
  };
}

function toHistoryEntryDto({ entry, path }: VisibleEntry, caller: UserId): HistoryEntryDto {
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

export function toHistoryOutcomeDto(keeping: FileKeeping | null): HistoryOutcomeDto | null {
  return keeping === null ? null : toKeepingDto(keeping);
}

/** One keeping that did happen — a replace of an upload always has one. */
export function toKeepingDto(keeping: FileKeeping): HistoryOutcomeDto {
  return keeping.kept
    ? { kept: true, entryId: keeping.entryId }
    : { kept: false, reason: keeping.reason };
}

export function toKeptDeleteDto(batch: KeptBatch): KeptDeleteDto {
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

export function toRestoredEntryDto(restored: RestoredEntry): RestoredEntryDto {
  return {
    path: restored.path.relative,
    etag: restored.etag?.value ?? null,
    size: restored.size,
    written: restored.written,
    history: toHistoryOutcomeDto(restored.history),
  };
}
