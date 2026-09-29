import type { UserId } from '@domain/auth';
import type { Clock } from '@domain/shared';
import {
  OPEN_FOLDERS_LIMIT,
  orderTabs,
  RECENT_FOLDERS_LIMIT,
  WorkspacePath,
} from '@domain/workspace';
import type { WorkspaceAllowlistSource } from './ports/workspace-allowlist.port';
import type { WorkspaceDirectoryProbe } from './ports/workspace-directory.probe';
import type { FolderLimits, WorkspaceFolderRepository } from './ports/workspace-folder.repository';
import type { FolderView, RevalidatedFolders } from './folder-view';
import { resolveFolder } from './resolve-folder';

/** A folder just opened, as its tab, and whether the tab is new. */
export interface OpenFolderResult {
  readonly view: FolderView;
  readonly created: boolean;
}

/**
 * Opens a folder in a tab of its own — the set and the order of the tabs follow the user, on the
 * server ([06 · D-10](../../../../../docs/plans/06-workbench/decisions.md)).
 *
 * The folder goes through the very gate a session goes through (`resolveFolder`), and a refusal
 * there records **nothing** — neither a tab nor a recent folder (plan 06, S-45). Opening is also
 * what puts a folder on the recent list ([06 · D-14](../../../../../docs/plans/06-workbench/decisions.md)).
 *
 * It never touches a session of Claude: sessions are `session`'s, and this module does not know
 * they exist.
 */
export class OpenFolderUseCase {
  constructor(
    private readonly allowlist: WorkspaceAllowlistSource,
    private readonly directories: WorkspaceDirectoryProbe,
    private readonly folders: WorkspaceFolderRepository,
    private readonly clock: Clock,
    private readonly limits: FolderLimits = {
      openFolders: OPEN_FOLDERS_LIMIT,
      recentFolders: RECENT_FOLDERS_LIMIT,
    },
  ) {}

  /**
   * @throws whatever {@link resolveFolder} refuses the path with
   * @throws {import('@domain/workspace').OpenFoldersLimitReachedError} a new tab past the ceiling
   */
  async execute(raw: string, userId: UserId): Promise<OpenFolderResult> {
    const { path, workspace } = await resolveFolder(
      this.allowlist.current(),
      this.directories,
      raw,
      userId,
    );
    const opened = await this.folders.open(
      { userId, path, root: workspace.root, at: this.clock.now() },
      this.limits,
    );

    return {
      view: { folder: opened.folder, rootLabel: workspace.label, state: 'available' },
      created: opened.created,
    };
  }
}

/**
 * The folder tabs of this user, in their order, each revalidated: one whose folder left the
 * allowlist comes back `notAllowed`, one that left the disk `missing` — marked, never dropped
 * (plan 06, S-47).
 */
export class ListOpenFoldersUseCase {
  constructor(private readonly folders: RevalidatedFolders) {}

  async execute(userId: UserId): Promise<readonly FolderView[]> {
    const { folders, view } = await this.folders.of(userId);

    return Promise.all(orderTabs(folders).map(view));
  }
}

/**
 * Closes a folder's tab.
 *
 * No gate: a folder that left the allowlist still has to be closable, or its tab would be stuck
 * open for good. Closing one that is not open is not an error — the answer to "close it" is the
 * same either way (plan 06, S-42). And it ends no session of Claude (S-49).
 */
export class CloseFolderUseCase {
  constructor(private readonly folders: WorkspaceFolderRepository) {}

  /** @throws {import('@domain/workspace').InvalidWorkspacePathError} not a path at all */
  async execute(raw: string, userId: UserId): Promise<void> {
    const path = WorkspacePath.create(raw);

    await this.folders.close(userId, path);
  }
}

/** Puts the folder tabs of this user in a new order, which has to name every open tab once. */
export class ReorderOpenFoldersUseCase {
  constructor(private readonly folders: WorkspaceFolderRepository) {}

  /**
   * @throws {import('@domain/workspace').InvalidWorkspacePathError} an entry that is not a path
   * @throws {import('@domain/workspace').OpenFoldersOrderConflictError} not the open set (plan 06, S-44)
   */
  async execute(raw: readonly string[], userId: UserId): Promise<void> {
    await this.folders.reorder(
      userId,
      raw.map((path) => WorkspacePath.create(path)),
    );
  }
}
