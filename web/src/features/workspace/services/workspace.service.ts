import { api, REQUEST_TIMEOUT_MS } from '@/shared/api/api';
import { folderName } from '@/shared/lib/folder-name';
import type {
  DirectoryListing,
  DirectoryQuery,
  OpenFolder,
  RecentFolder,
  ResolvedFolder,
  Workspace,
} from '../types/workspace';

/** The shape the backend answers with. It stops existing at the end of this file. */
interface WorkspaceListResponse {
  readonly workspaces: readonly Workspace[];
}

interface RecentFolderDto {
  readonly path: string;
  readonly rootLabel: string | null;
  readonly lastOpenedAt: string;
  readonly pinned: boolean;
  readonly available: boolean;
}

interface RecentFoldersResponse {
  readonly folders: readonly RecentFolderDto[];
}

interface OpenFoldersResponse {
  readonly folders: readonly OpenFolder[];
}

interface ResolvedFolderDto {
  readonly path: string;
  readonly root: Workspace;
}

/**
 * A query string with the folder in it.
 *
 * Every path travels in the search, never as a segment of the URL: a proxy that normalises `%2F` on
 * the way through would change the value the allowlist is about to check
 * (docs/architecture/backend/03-modules.md#as-rotas-http-do-workspace).
 */
function query(parameters: Readonly<Record<string, string>>): string {
  return new URLSearchParams(parameters).toString();
}

/**
 * The roots this user may open.
 *
 * A service knows the endpoint, its shape and how to read the answer — and nothing about React or
 * about when it should be called. That is the hook's decision.
 *
 * @throws {import('@/shared/api/errors').AppError} never a raw `Response`: `api.ts` has already
 *   turned the backend's envelope into something with a code and a translation key
 */
export async function fetchWorkspaces(): Promise<readonly Workspace[]> {
  return (await api.get<WorkspaceListResponse>('/workspaces')).workspaces;
}

/**
 * Whether a folder may be opened, and what it really is.
 *
 * The answer's `path` is the **real** one, every symlink resolved: it is the path that goes on — to
 * the URL and to the session — never the one the link spelled.
 */
export async function resolveFolder(path: string): Promise<ResolvedFolder> {
  const resolved = await api.get<ResolvedFolderDto>(`/workspaces/resolve?${query({ path })}`);

  return { path: resolved.path, name: folderName(resolved.path), root: resolved.root };
}

/**
 * One level of one folder.
 *
 * `hidden` is sent as the literal word the contract takes, and `prefix` only when there is one.
 *
 * @param signal cancels a listing nobody is waiting for any more — the dialog moved on before it
 *   answered (plan 06, S-77). It is joined to the client's deadline rather than replacing it: a
 *   caller's signal is honoured **instead of** the deadline, and a listing that hangs would then
 *   hang for ever.
 */
export function listDirectories(
  request: DirectoryQuery,
  signal?: AbortSignal,
): Promise<DirectoryListing> {
  const parameters: Record<string, string> = {
    path: request.path,
    hidden: String(request.hidden),
  };

  if (request.prefix !== undefined && request.prefix !== '') {
    parameters['prefix'] = request.prefix;
  }

  return api.get<DirectoryListing>(
    `/workspaces/directories?${query(parameters)}`,
    signal === undefined
      ? {}
      : { signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) },
  );
}

/**
 * The folders this user opened, pinned first.
 *
 * `available` becomes the **reason** it is not: a folder under no root of this user left the
 * allowlist; one whose root is still there left the disk. The screen says which, and it could not
 * tell from a boolean.
 */
export async function fetchRecentFolders(): Promise<readonly RecentFolder[]> {
  return (await api.get<RecentFoldersResponse>('/workspaces/recent')).folders.map((folder) => ({
    path: folder.path,
    name: folderName(folder.path),
    rootLabel: folder.rootLabel,
    lastOpenedAt: folder.lastOpenedAt,
    pinned: folder.pinned,
    unavailable: folder.available ? null : folder.rootLabel === null ? 'notAllowed' : 'missing',
  }));
}

/** Pins or unpins a recent folder. Idempotent on the server. */
export async function pinRecentFolder(path: string, pinned: boolean): Promise<void> {
  await api.put<undefined>('/workspaces/recent/pin', { path, pinned });
}

/** Takes a folder off the recent list — also answered when it was not on it. */
export async function forgetRecentFolder(path: string): Promise<void> {
  await api.delete<undefined>(`/workspaces/recent?${query({ path })}`);
}

/** The folder tabs, in the order the user left them, each revalidated by the server. */
export async function fetchOpenFolders(): Promise<readonly OpenFolder[]> {
  return (await api.get<OpenFoldersResponse>('/workspaces/open-folders')).folders;
}

/**
 * Opens a folder in a tab — and records it among the recent ones, which is the same row.
 *
 * Idempotent: the tab already open is answered as it is.
 */
export function openFolder(path: string): Promise<OpenFolder> {
  return api.post<OpenFolder>('/workspaces/open-folders', { path });
}

/**
 * Closes a folder tab. Its Claude sessions are not touched: they live in the backend, and closing a
 * tab is not ending them. Answered also when it was not open.
 */
export async function closeFolder(path: string): Promise<void> {
  await api.delete<undefined>(`/workspaces/open-folders?${query({ path })}`);
}

/**
 * Puts the folder tabs in a new order — the whole set, as this window knows it.
 *
 * @throws {import('@/shared/api/errors').AppError} `CONFLICT` when the set is not the one open on the
 *   server any more: another window opened or closed one meanwhile
 */
export async function reorderFolders(paths: readonly string[]): Promise<void> {
  await api.put<undefined>('/workspaces/open-folders/order', { paths });
}
