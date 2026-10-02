import type { KeptEntry } from '@/features/file-history';
import { api } from '@/shared/api/api';
import type { DirectoryListing, NewEntryKind, WrittenEntry } from '../types/explorer';

/**
 * The files of an open folder, as the `files` routes have them (plan 07, F1 and F2).
 *
 * Every call names the **folder of the tab** and a path relative to it — never one absolute path:
 * the fence is the open folder, and the server checks both
 * ([07 · D-11](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-11--a-raiz-do-explorer-é-a-pasta-aberta)).
 * Paths travel in the query string or the body, never in a URL segment. The I/O itself is logged by
 * `api.ts`, at both edges.
 */

/** The second step of a path that changes what Claude may do (07 · D-15). */
export interface SensitiveOption {
  readonly confirmSensitive?: boolean;
}

/** What a move or a copy may name besides the two paths. */
export interface RelocateOptions extends SensitiveOption {
  /** The version the person saw: the server refuses with `412` when the file changed since. */
  readonly ifMatch?: string | null;
}

/** What a delete may send. */
export interface DeleteOptions extends RelocateOptions {
  /** The count a `409` showed — the folder goes, with everything in it, only when it still holds that. */
  readonly expectedEntries?: number;
}

function query(fields: Readonly<Record<string, string | undefined>>): string {
  const search = new URLSearchParams();

  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined) {
      search.set(name, value);
    }
  }

  return search.toString();
}

/**
 * One level of a folder of the tab — `''` for the folder itself.
 *
 * @throws {import('@/shared/api/errors').AppError} `WORKSPACE_NOT_ALLOWED` past the allowlist or above
 *   the folder, `WORKSPACE_NOT_FOUND` for a folder gone, `FILE_NOT_FOUND`, `WORKSPACE_NOT_A_DIRECTORY`
 */
export async function fetchDirectory(folder: string, path: string): Promise<DirectoryListing> {
  const listing = await api.get<DirectoryListing>(`/files/tree?${query({ folder, path })}`);

  return { path: listing.path, entries: listing.entries, truncated: listing.truncated };
}

/** The text of a file — what "New from this file" starts the new one with. */
export async function readFileText(folder: string, path: string): Promise<string> {
  const file = await api.get<{ readonly content: string }>(
    `/files/content?${query({ folder, path })}`,
  );

  return file.content;
}

/**
 * Creates a file — with what it starts with — or a folder. Never over anything: `409 FILE_EXISTS`.
 */
export function createEntry(
  folder: string,
  path: string,
  kind: NewEntryKind,
  options: SensitiveOption & { readonly content?: string } = {},
): Promise<WrittenEntry> {
  return api.post<WrittenEntry>('/files', {
    folder,
    path,
    kind,
    ...(kind === 'file' ? { content: options.content ?? '' } : {}),
    confirmSensitive: options.confirmSensitive ?? false,
  });
}

/** A relocation of an entry — never over another one. */
export type Relocation = (
  folder: string,
  from: string,
  to: string,
  options?: RelocateOptions,
) => Promise<WrittenEntry>;

function relocator(route: '/files/move' | '/files/copy'): Relocation {
  return (folder, from, to, options = {}) =>
    api.post<WrittenEntry>(route, {
      folder,
      from,
      to,
      ...(options.ifMatch == null ? {} : { ifMatch: options.ifMatch }),
      confirmSensitive: options.confirmSensitive ?? false,
    });
}

/** Renames or moves an entry — never over another one. */
export const moveEntry: Relocation = relocator('/files/move');

/** Copies an entry — a folder all the way down — never over another one. */
export const copyEntry: Relocation = relocator('/files/copy');

/**
 * Deletes an entry for good — what the local history could not keep, and an undo's inverse. A folder
 * with something in it answers `409 DIRECTORY_NOT_EMPTY` with how much would go, and goes only when
 * `expectedEntries` says that count back (07 · D-06).
 */
export async function deleteEntry(
  folder: string,
  path: string,
  options: DeleteOptions = {},
): Promise<void> {
  const counted = options.expectedEntries;
  const search = query({
    folder,
    path,
    recursive: counted === undefined ? undefined : 'true',
    expectedEntries: counted === undefined ? undefined : String(counted),
    confirmSensitive: options.confirmSensitive === true ? 'true' : undefined,
  });

  await api.delete<undefined>(
    `/files?${search}`,
    options.ifMatch == null ? {} : { headers: { 'if-match': options.ifMatch } },
  );
}

/** What a delete the local history kept answers: every entry that went, under one batch (07 · F8). */
export interface KeptDeletion {
  readonly batchId: string;
  readonly entries: readonly KeptEntry[];
}

/**
 * Deletes an entry — a folder with all it holds — keeping each file and folder in the local history
 * first, so the delete can be undone (07 · B-58). What does not fit is **not** deleted: a file answers
 * `428` (`reason: notKept`), a folder `409 DIRECTORY_NOT_EMPTY` with `notKept` — and the person is
 * asked the definitive delete of {@link deleteEntry} instead.
 */
export async function deleteKeepingHistory(
  folder: string,
  path: string,
  options: SensitiveOption = {},
): Promise<KeptDeletion> {
  const search = query({
    folder,
    path,
    keepInHistory: 'true',
    confirmSensitive: options.confirmSensitive === true ? 'true' : undefined,
  });
  const answer = await api.delete<{ readonly kept: KeptDeletion }>(`/files?${search}`);

  return { batchId: answer.kept.batchId, entries: answer.kept.entries };
}
