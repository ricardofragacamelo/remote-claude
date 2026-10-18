import type {
  FileLimitsPayload,
  HistoryPagePayload,
  HistoryPagePayloadEntriesItem,
  HistoryPagePayloadEntriesItemAuthor,
  KeptDeletePayloadKeptEntriesItem,
  RestoredEntryPayload,
} from '@remote-claude/contracts';

import type { AppError } from '@/shared/api/errors';

/**
 * Why a version was kept: the write that would have lost it — a save, a delete, a restore, an
 * upload over the file (07 · B-55). Moving never loses a version, so there is no `move`.
 */
export const HISTORY_REASONS = ['save', 'delete', 'restore', 'upload'] as const;

export type HistoryReason = (typeof HISTORY_REASONS)[number];

/** Who wrote the version: the person asking, or somebody else who reaches the same folder (D-17). */
export type HistoryAuthor = HistoryPagePayloadEntriesItemAuthor;

/** One version of the local history, as the Timeline shows it (`GET /files/history`). */
export type HistoryEntry = HistoryPagePayloadEntriesItem;

/** One page of versions, newest first. */
export type HistoryPage = HistoryPagePayload;

/** One entry a delete kept, as its `200` lists it — what the "Undo" of the delete restores. */
export type KeptEntry = KeptDeletePayloadKeptEntriesItem;

/**
 * What a restore left on disk — the size and the fate of the version it replaced are the server's
 * to know; this screen names only what it shows (`POST /files/history/:entryId/restore`).
 */
export type RestoredEntry = Pick<RestoredEntryPayload, 'path' | 'etag' | 'written'>;

/** How one entry of an undone delete went — the explorer's outcome screen reads it as its own. */
export type RestoreResult =
  | { readonly path: string; readonly ok: true }
  | { readonly path: string; readonly ok: false; readonly error: AppError };

/** The ceilings of the local history the server says — what the help tells. */
export type HistoryLimits = Pick<FileLimitsPayload, 'historyMaxFileBytes'>;
