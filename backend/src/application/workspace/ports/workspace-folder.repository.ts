import type { UserId } from '@domain/auth';
import type { WorkspaceFolder, WorkspacePath } from '@domain/workspace';

/** That a user opened a folder, then — what {@link WorkspaceFolderRepository.open} records. */
export interface FolderVisit {
  readonly userId: UserId;
  /** The real path, already cleared by the allowlist and the disk. */
  readonly path: WorkspacePath;
  readonly root: WorkspacePath;
  readonly at: Date;
}

/** The ceilings an opening is held to. */
export interface FolderLimits {
  readonly openFolders: number;
  readonly recentFolders: number;
}

/** A folder as the opening left it, and whether its tab is new. */
export interface OpenedFolder {
  readonly folder: WorkspaceFolder;
  readonly created: boolean;
}

/**
 * How "this user opened this folder" is stored and read back — the recent list and the folder
 * tabs, which are one record ([06 · D-14](../../../../../docs/plans/06-workbench/decisions.md)).
 *
 * Every write is scoped by user, and the ones that read the user's other folders to decide —
 * opening against the ceiling, reordering against the open set — are **atomic per user**: two
 * windows opening folders at the same moment must neither pass the ceiling together nor leave two
 * records of one folder (plan 06, S-46). The decisions themselves are the domain's
 * (`decideOpening`, `reorderTabs`, `recentBeyondLimit`); the repository only makes them atomic.
 */
export interface WorkspaceFolderRepository {
  /** Every folder of this user, in no particular order. */
  findByUser(userId: UserId): Promise<readonly WorkspaceFolder[]>;

  /**
   * Opens a folder: its tab (a new one, or the one already open), its instant on the recent list,
   * and the recent list trimmed to the ceiling.
   *
   * @throws {import('@domain/workspace').OpenFoldersLimitReachedError} a new tab past the ceiling
   */
  open(visit: FolderVisit, limits: FolderLimits): Promise<OpenedFolder>;

  /**
   * Closes a folder's tab. A folder no longer on the recent list is forgotten with it. Closing one
   * that is not open changes nothing.
   */
  close(userId: UserId, path: WorkspacePath): Promise<void>;

  /**
   * Puts the open tabs in a new order.
   *
   * @throws {import('@domain/workspace').OpenFoldersOrderConflictError} not an order of the open tabs
   */
  reorder(userId: UserId, paths: readonly WorkspacePath[]): Promise<void>;

  /** Pins or unpins a folder of the recent list. One that is not on it is left alone. */
  pin(userId: UserId, path: WorkspacePath, pinned: boolean): Promise<void>;

  /**
   * Takes a folder off the recent list. Its tab, if open, stays open; one that is not on the list
   * changes nothing.
   */
  forget(userId: UserId, path: WorkspacePath): Promise<void>;
}

export const WORKSPACE_FOLDER_REPOSITORY = Symbol('WorkspaceFolderRepository');
