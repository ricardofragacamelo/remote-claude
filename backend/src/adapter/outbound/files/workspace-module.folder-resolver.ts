import { Inject, Injectable } from '@nestjs/common';

import type { FolderResolver } from '@application/files';
import { ResolveWorkspaceUseCase } from '@application/workspace';
import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '@domain/workspace';

/**
 * `files` asking `workspace` for the folder of a tab — the whole of the coupling between the two
 * ([07 · D-01](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-01--módulo-novo-ou-extensão-do-workspace)).
 *
 * The same four checks as a session's `cwd`, in the same order: the pure rule, existence, the real
 * path inside a root of this user, and a directory. It does **not** record a use: reading a file
 * is not opening a workspace, and "last used" would move with every click on the tree.
 */
@Injectable()
export class WorkspaceModuleFolderResolver implements FolderResolver {
  constructor(
    @Inject(ResolveWorkspaceUseCase) private readonly workspaces: ResolveWorkspaceUseCase,
  ) {}

  async resolve(raw: string, userId: UserId): Promise<WorkspacePath> {
    return (await this.workspaces.execute(raw, userId)).path;
  }
}
