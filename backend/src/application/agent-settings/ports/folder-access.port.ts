import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '@domain/workspace';

/**
 * The folders of a user, as the `workspace` module answers — the fence every route with a folder
 * goes through before anything else.
 */
export interface FolderAccess {
  /**
   * @throws whatever the workspace refuses with — `WORKSPACE_NOT_ALLOWED`, `FORBIDDEN`,
   *   `WORKSPACE_NOT_FOUND`, `WORKSPACE_NOT_A_DIRECTORY`
   */
  resolve(rawPath: string, userId: UserId): Promise<WorkspacePath>;

  /** The folder, and the root of the allowlist it is under — the bound a project's files are read in. */
  locate(
    rawPath: string,
    userId: UserId,
  ): Promise<{ readonly folder: WorkspacePath; readonly root: string }>;

  /** The first root of the allowlist the user may use — where a probe that needs no folder runs. */
  firstRoot(userId: UserId): Promise<WorkspacePath | null>;
}

export const FOLDER_ACCESS = Symbol('FolderAccess');
