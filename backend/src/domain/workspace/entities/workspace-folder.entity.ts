import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '../value-objects/workspace-path.value-object';

/** The persisted shape of a folder a user opened, as the mapper on either side sees it. */
export interface WorkspaceFolderSnapshot {
  readonly userId: UserId;
  /** The real path of the folder. */
  readonly path: WorkspacePath;
  /** The root it was opened under. */
  readonly root: WorkspacePath;
  /** When it was last opened; `null` once it was taken off the recent list while its tab is open. */
  readonly lastOpenedAt: Date | null;
  readonly pinned: boolean;
  /** Where its tab sits among the open ones; `null` when the tab is closed. */
  readonly tabPosition: number | null;
}

/**
 * That a user opened a folder: one fact, which is both a recent folder and — while its tab is
 * open — a tab ([06 · D-14](../../../../../docs/plans/06-workbench/decisions.md)).
 *
 * One record and not two, because "this person opened this folder" is one thing; a recent list and
 * a tab list kept apart would be two rows for it that disagree the first time one is written and
 * the other is not. A folder, not a root: it may be any directory under a root, and the
 * `workspaces` table, which says which **root** was used, stays as it is.
 *
 * Metadata only — a path and when, never a listing and never a file.
 */
export class WorkspaceFolder {
  private constructor(private readonly state: WorkspaceFolderSnapshot) {}

  /** A folder opened for the first time, as of `instant`: recent, not pinned, no tab yet. */
  static opened(
    userId: UserId,
    path: WorkspacePath,
    root: WorkspacePath,
    instant: Date,
  ): WorkspaceFolder {
    return new WorkspaceFolder({
      userId,
      path,
      root,
      lastOpenedAt: instant,
      pinned: false,
      tabPosition: null,
    });
  }

  /** Rehydrates a record the repository read back. */
  static restore(snapshot: WorkspaceFolderSnapshot): WorkspaceFolder {
    return new WorkspaceFolder({ ...snapshot });
  }

  get userId(): UserId {
    return this.state.userId;
  }

  get path(): WorkspacePath {
    return this.state.path;
  }

  get root(): WorkspacePath {
    return this.state.root;
  }

  get lastOpenedAt(): Date | null {
    return this.state.lastOpenedAt;
  }

  get pinned(): boolean {
    return this.state.pinned;
  }

  get tabPosition(): number | null {
    return this.state.tabPosition;
  }

  /** Its tab is open. */
  get isOpen(): boolean {
    return this.state.tabPosition !== null;
  }

  /** It is on the recent list. */
  get isRecent(): boolean {
    return this.state.lastOpenedAt !== null;
  }

  snapshot(): WorkspaceFolderSnapshot {
    return { ...this.state };
  }
}
