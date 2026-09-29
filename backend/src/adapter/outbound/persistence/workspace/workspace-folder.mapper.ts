import { UserId } from '@domain/auth';
import { WorkspaceFolder, WorkspacePath } from '@domain/workspace';
import type { workspaceFolders } from '@infra/database/schema';

type FolderRow = typeof workspaceFolders.$inferSelect;
type FolderInsert = typeof workspaceFolders.$inferInsert;

/** Translation between the table and the entity. The two change for different reasons. */
export function toEntity(row: FolderRow): WorkspaceFolder {
  return WorkspaceFolder.restore({
    userId: UserId.create(row.userId),
    path: WorkspacePath.create(row.path),
    root: WorkspacePath.create(row.rootPath),
    lastOpenedAt: row.lastOpenedAt,
    pinned: row.isPinned,
    tabPosition: row.tabPosition,
  });
}

/** The row an entity should be written as. `updatedAt` is set here, never left to a trigger. */
export function toRow(folder: WorkspaceFolder, now: Date): FolderInsert {
  const snapshot = folder.snapshot();

  return {
    userId: snapshot.userId.value,
    path: snapshot.path.value,
    rootPath: snapshot.root.value,
    lastOpenedAt: snapshot.lastOpenedAt,
    isPinned: snapshot.pinned,
    tabPosition: snapshot.tabPosition,
    updatedAt: now,
  };
}
