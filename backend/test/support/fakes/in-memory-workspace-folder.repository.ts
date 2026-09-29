import type {
  FolderLimits,
  FolderVisit,
  OpenedFolder,
  WorkspaceFolderRepository,
} from '@application/workspace';
import type { UserId } from '@domain/auth';
import { decideOpening, recentBeyondLimit, reorderTabs, WorkspaceFolder } from '@domain/workspace';
import type { WorkspacePath } from '@domain/workspace';

/**
 * The folders users opened, in a map keyed by the pair that is the identity of a record.
 *
 * It decides with the very domain rules the Drizzle repository uses, so a use case proved against
 * it is proved against the same decisions — a fake that let a ninth tab through would hide the bug
 * it was meant to catch.
 */
export class InMemoryWorkspaceFolderRepository implements WorkspaceFolderRepository {
  readonly rows = new Map<string, WorkspaceFolder>();

  /** Set to make the next write fail as the database would. */
  failWith: Error | null = null;

  findByUser(userId: UserId): Promise<readonly WorkspaceFolder[]> {
    return Promise.resolve(this.of(userId));
  }

  open(visit: FolderVisit, limits: FolderLimits): Promise<OpenedFolder> {
    return this.write(() => {
      const folders = this.of(visit.userId);
      const decision = decideOpening(folders, visit.path, limits.openFolders);
      const existing = folders.find((folder) => folder.path.equals(visit.path));
      const opened = WorkspaceFolder.restore({
        userId: visit.userId,
        path: visit.path,
        root: visit.root,
        lastOpenedAt: visit.at,
        pinned: existing?.pinned ?? false,
        tabPosition: decision.position,
      });

      this.put(opened);

      for (const gone of recentBeyondLimit(this.of(visit.userId), limits.recentFolders)) {
        this.rows.delete(keyOf(gone.userId, gone.path));
      }

      return { folder: opened, created: !decision.alreadyOpen };
    });
  }

  close(userId: UserId, path: WorkspacePath): Promise<void> {
    return this.write(() => {
      const folder = this.rows.get(keyOf(userId, path));

      if (folder === undefined) {
        return;
      }

      if (folder.isRecent) {
        this.put(WorkspaceFolder.restore({ ...folder.snapshot(), tabPosition: null }));
      } else {
        this.rows.delete(keyOf(userId, path));
      }
    });
  }

  reorder(userId: UserId, paths: readonly WorkspacePath[]): Promise<void> {
    return this.write(() => {
      for (const [path, position] of reorderTabs(this.of(userId), paths)) {
        const folder = this.of(userId).find((candidate) => candidate.path.value === path);

        if (folder !== undefined) {
          this.put(WorkspaceFolder.restore({ ...folder.snapshot(), tabPosition: position }));
        }
      }
    });
  }

  pin(userId: UserId, path: WorkspacePath, pinned: boolean): Promise<void> {
    return this.write(() => {
      const folder = this.rows.get(keyOf(userId, path));

      if (folder?.isRecent === true) {
        this.put(WorkspaceFolder.restore({ ...folder.snapshot(), pinned }));
      }
    });
  }

  forget(userId: UserId, path: WorkspacePath): Promise<void> {
    return this.write(() => {
      const folder = this.rows.get(keyOf(userId, path));

      if (folder?.isOpen === true) {
        this.put(
          WorkspaceFolder.restore({ ...folder.snapshot(), lastOpenedAt: null, pinned: false }),
        );
      } else {
        this.rows.delete(keyOf(userId, path));
      }
    });
  }

  /** Stores a folder as it is, for a test to set up the state it starts from. */
  put(folder: WorkspaceFolder): void {
    this.rows.set(keyOf(folder.userId, folder.path), folder);
  }

  private of(userId: UserId): WorkspaceFolder[] {
    return [...this.rows.values()].filter((folder) => folder.userId.equals(userId));
  }

  private write<T>(work: () => T): Promise<T> {
    if (this.failWith !== null) {
      return Promise.reject(this.failWith);
    }

    try {
      return Promise.resolve(work());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/** `JSON.stringify` of the pair: a path may contain any byte a separator could be. */
function keyOf(userId: UserId, path: WorkspacePath): string {
  return JSON.stringify([userId.value, path.value]);
}
