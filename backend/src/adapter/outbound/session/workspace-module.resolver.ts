import { Inject, Injectable } from '@nestjs/common';

import { ResolveWorkspaceUseCase } from '@application/workspace';
import type { FolderLocator, WorkspaceResolver } from '@application/session';
import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '@domain/workspace';

/**
 * `session` asking `workspace` whether a path may be opened.
 *
 * Two modules never call each other's use cases directly: the consumer declares a port and an
 * adapter joins the two ends. This is that adapter, and it is the whole of the coupling between
 * the two modules — see docs/architecture/backend/03-modules.md#fronteiras.
 *
 * Resolving records the use, because opening a session on a workspace is what "last used" means;
 * locating does not — listing what runs in a folder is not opening it.
 */
@Injectable()
export class WorkspaceModuleResolver implements WorkspaceResolver, FolderLocator {
  constructor(
    @Inject(ResolveWorkspaceUseCase) private readonly workspaces: ResolveWorkspaceUseCase,
  ) {}

  async resolve(rawPath: string, userId: UserId): Promise<WorkspacePath> {
    return (await this.workspaces.execute(rawPath, userId, { recordUse: true })).path;
  }

  async locate(rawPath: string, userId: UserId): Promise<WorkspacePath> {
    return (await this.workspaces.execute(rawPath, userId, { recordUse: false })).path;
  }
}
