import { Inject, Injectable } from '@nestjs/common';

import type { FolderAccess } from '@application/claude-config';
import { ListWorkspacesUseCase, ResolveWorkspaceUseCase } from '@application/workspace';
import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '@domain/workspace';

/**
 * `claude-config` asking `workspace` which folders a person may name — the fence every route with a
 * folder goes through first. Locating never records a use: reading the configuration of a folder is
 * not opening it.
 */
@Injectable()
export class WorkspaceModuleFolderAccess implements FolderAccess {
  constructor(
    @Inject(ResolveWorkspaceUseCase) private readonly workspaces: ResolveWorkspaceUseCase,
    @Inject(ListWorkspacesUseCase) private readonly roots: ListWorkspacesUseCase,
  ) {}

  /** The folder alone — what most routes need. */
  async resolve(rawPath: string, userId: UserId): Promise<WorkspacePath> {
    return (await this.locate(rawPath, userId)).folder;
  }

  locate(
    rawPath: string,
    userId: UserId,
  ): Promise<{ readonly folder: WorkspacePath; readonly root: string }> {
    return this.workspaces
      .execute(rawPath, userId, { recordUse: false })
      .then(({ path, workspace }) => ({ folder: path, root: workspace.root.value }));
  }

  async firstRoot(userId: UserId): Promise<WorkspacePath | null> {
    return (await this.roots.execute(userId))[0]?.root ?? null;
  }
}
