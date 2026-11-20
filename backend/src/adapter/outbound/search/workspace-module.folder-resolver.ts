import { Inject, Injectable } from '@nestjs/common';

import type { FolderResolver } from '@application/search';
import { ResolveWorkspaceUseCase } from '@application/workspace';
import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '@domain/workspace';
import { resolveViaWorkspace } from '../workspace/resolve-via-workspace';

/**
 * `search` asking `workspace` for the folder of a tab — the whole of the coupling between the two
 * (docs/architecture/backend/03-modules.md#search). Same four checks, same order, as `files`'s own
 * resolver: the pure rule, existence, the real path inside a root of this user, and a directory.
 */
@Injectable()
export class WorkspaceModuleSearchFolderResolver implements FolderResolver {
  constructor(
    @Inject(ResolveWorkspaceUseCase) private readonly workspaces: ResolveWorkspaceUseCase,
  ) {}

  async resolve(raw: string, userId: UserId): Promise<WorkspacePath> {
    return resolveViaWorkspace(this.workspaces, raw, userId);
  }
}
