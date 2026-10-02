import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '@domain/workspace';

/**
 * How `session` asks `workspace` which real folder a path names, for a question rather than a
 * session.
 *
 * The same gate {@link import('./workspace-resolver.port').WorkspaceResolver} goes through — the
 * same refusals, in the same order — without recording that the folder was used: listing what runs
 * in a folder is not opening it, and a list polled every few seconds would otherwise rewrite the
 * folder's "last used" on every poll.
 */
export interface FolderLocator {
  /**
   * @throws {import('@domain/workspace').InvalidWorkspacePathError} empty or relative
   * @throws {import('@domain/workspace').WorkspaceNotAllowedError} outside every root
   * @throws {import('@domain/workspace').WorkspaceForbiddenError} a root of somebody else
   * @throws {import('@domain/workspace').WorkspaceNotFoundError} missing
   * @throws {import('@domain/workspace').WorkspaceNotADirectoryError} it is a file
   */
  locate(rawPath: string, userId: UserId): Promise<WorkspacePath>;
}

export const FOLDER_LOCATOR = Symbol('FolderLocator');
