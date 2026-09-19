import { UserId } from '@domain/auth';
import { WorkspacePath, WorkspaceUsage } from '@domain/workspace';
import type { workspaces } from '@infra/database/schema';

type WorkspaceRow = typeof workspaces.$inferSelect;
type WorkspaceInsert = typeof workspaces.$inferInsert;

/** Translation between the table and the entity. The two change for different reasons. */
export function toEntity(row: WorkspaceRow): WorkspaceUsage {
  return WorkspaceUsage.restore({
    userId: UserId.create(row.userId),
    root: WorkspacePath.create(row.rootPath),
    label: row.label,
    lastUsedAt: row.lastUsedAt,
  });
}

/** The row an entity should be written as. `updatedAt` is set here, never left to a trigger. */
export function toRow(usage: WorkspaceUsage, now: Date): WorkspaceInsert {
  const snapshot = usage.snapshot();

  return {
    userId: snapshot.userId.value,
    rootPath: snapshot.root.value,
    label: snapshot.label,
    lastUsedAt: snapshot.lastUsedAt,
    updatedAt: now,
  };
}
