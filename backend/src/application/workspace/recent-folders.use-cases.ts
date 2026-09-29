import type { UserId } from '@domain/auth';
import { orderRecent, WorkspacePath } from '@domain/workspace';
import type { WorkspaceFolderRepository } from './ports/workspace-folder.repository';
import type { FolderView, RevalidatedFolders } from './folder-view';

/** A recent folder as it stands now, with the instant that puts it on the list. */
export interface RecentFolderView extends FolderView {
  readonly lastOpenedAt: Date;
}

/**
 * The folders this user opened, pinned first and then newest first — only theirs (plan 06, S-36),
 * each revalidated: one that left the allowlist or the disk comes back unavailable instead of
 * vanishing (S-37).
 */
export class ListRecentFoldersUseCase {
  constructor(private readonly folders: RevalidatedFolders) {}

  async execute(userId: UserId): Promise<readonly RecentFolderView[]> {
    const { folders, view } = await this.folders.of(userId);

    return Promise.all(
      orderRecent(folders).map(async ({ folder, lastOpenedAt }) => ({
        ...(await view(folder)),
        lastOpenedAt,
      })),
    );
  }
}

/**
 * Pins or unpins a recent folder. Pinning one that is already pinned changes nothing, and one that
 * is not on the list is left alone (plan 06, S-39). No gate: unpinning a folder that left the
 * allowlist has to be possible.
 */
export class PinRecentFolderUseCase {
  constructor(private readonly folders: WorkspaceFolderRepository) {}

  /** @throws {import('@domain/workspace').InvalidWorkspacePathError} not a path at all */
  async execute(raw: string, pinned: boolean, userId: UserId): Promise<void> {
    await this.folders.pin(userId, WorkspacePath.create(raw), pinned);
  }
}

/**
 * Takes a folder off the recent list; taking off one that is not there changes nothing (plan 06,
 * S-40). An open tab of it stays open.
 */
export class ForgetRecentFolderUseCase {
  constructor(private readonly folders: WorkspaceFolderRepository) {}

  /** @throws {import('@domain/workspace').InvalidWorkspacePathError} not a path at all */
  async execute(raw: string, userId: UserId): Promise<void> {
    await this.folders.forget(userId, WorkspacePath.create(raw));
  }
}
