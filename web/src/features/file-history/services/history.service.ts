import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import type {
  HistoryEntry,
  HistoryLimits,
  HistoryPage,
  HistoryReason,
  RestoredEntry,
} from '../types/history';

/**
 * The local history of a folder, as the `files` routes have it (plan 07, F8): the versions of one
 * path, the files deleted recently, and restoring one of them.
 *
 * Every call names the **folder of the tab**; a path travels in the search, never as a segment. The
 * I/O itself is logged by `api.ts`, at both edges.
 */

/** How many versions one page brings. */
export const HISTORY_PAGE_SIZE = 20;

interface HistoryPageDto {
  readonly entries: readonly HistoryEntry[];
  readonly nextCursor: string | null;
}

interface RestoredDto extends RestoredEntry {
  readonly size: number;
}

function search(fields: Readonly<Record<string, string | null>>): string {
  const query = new URLSearchParams();

  for (const [name, value] of Object.entries(fields)) {
    if (value !== null) {
      query.set(name, value);
    }
  }

  return query.toString();
}

/** The DTO's entries, as the model has them — the shape of the backend stops here. */
function pageOf(dto: HistoryPageDto): HistoryPage {
  return {
    entries: dto.entries.map((entry) => ({
      id: entry.id,
      path: entry.path,
      entryKind: entry.entryKind,
      reason: entry.reason,
      kept: entry.kept,
      sizeBytes: entry.sizeBytes,
      author: { self: entry.author.self, id: entry.author.id },
      at: entry.at,
      batchId: entry.batchId,
    })),
    nextCursor: dto.nextCursor,
  };
}

/**
 * The versions of one path, newest first — of a reason only, when given.
 *
 * @throws {import('@/shared/api/errors').AppError} `WORKSPACE_NOT_FOUND`, `WORKSPACE_NOT_ALLOWED`
 */
export async function fetchVersions(
  folder: string,
  path: string,
  reason: HistoryReason | null,
  cursor: string | null,
): Promise<HistoryPage> {
  const fields = { folder, path, reason, cursor, limit: String(HISTORY_PAGE_SIZE) };
  return pageOf(await api.get<HistoryPageDto>(`/files/history?${search(fields)}`));
}

/** The files of the folder that no longer exist — the last delete of each — newest first. */
export async function fetchDeleted(folder: string, cursor: string | null): Promise<HistoryPage> {
  const fields = { folder, deleted: 'true', cursor, limit: String(HISTORY_PAGE_SIZE) };
  return pageOf(await api.get<HistoryPageDto>(`/files/history?${search(fields)}`));
}

/** What a restore names besides the version. */
export interface RestoreOptions {
  /**
   * The version on disk the person sees — sent as `If-Match`: the current file is replaced only
   * when it is still that one (`412` otherwise). Without it, a deleted file is recreated (`409` when
   * the path was taken since).
   */
  readonly ifMatch?: string | null;

  /** The second step of a file that changes what Claude may do (07 · D-15). */
  readonly confirmSensitive?: boolean;
}

/**
 * Puts a version back — a write like any other, kept in the trail as `file.restored`.
 *
 * @throws {import('@/shared/api/errors').AppError} `HISTORY_ENTRY_NOT_FOUND`, `FILE_CHANGED`,
 *   `FILE_EXISTS`, `PRECONDITION_REQUIRED` (`sensitiveFile`)
 */
export async function restoreVersion(
  folder: string,
  entryId: string,
  options: RestoreOptions = {},
): Promise<RestoredEntry> {
  const restored = await api.post<RestoredDto>(
    `/files/history/${encodeURIComponent(entryId)}/restore`,
    { folder, confirmSensitive: options.confirmSensitive ?? false },
    options.ifMatch == null ? {} : { headers: { 'if-match': options.ifMatch } },
  );

  return { path: restored.path, etag: restored.etag, written: restored.written };
}

/**
 * The version on disk of a file the editor does not hold — what a restore over it names as
 * `If-Match`; `null` when it is not there, and a restore recreates it.
 */
export async function fetchCurrentVersion(folder: string, path: string): Promise<string | null> {
  try {
    const file = await api.get<{ readonly etag: string }>(
      `/files/content?${search({ folder, path })}`,
    );
    return file.etag;
  } catch (error) {
    if (error instanceof AppError && error.code === 'FILE_NOT_FOUND') {
      return null;
    }

    throw error;
  }
}

/** The ceiling of a version the history keeps, from the limits of the installation. */
export async function fetchHistoryLimits(): Promise<HistoryLimits> {
  const limits = await api.get<HistoryLimits>('/files/limits');
  return { historyMaxFileBytes: limits.historyMaxFileBytes };
}
