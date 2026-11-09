import { Inject, Injectable } from '@nestjs/common';

import type { RuleFolderResolver } from '@application/permission';
import { ResolveWorkspaceUseCase, WORKSPACE_ALLOWLIST_SOURCE } from '@application/workspace';
import type { WorkspaceAllowlistSource } from '@application/workspace';
import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '@domain/workspace';
import { resolveViaWorkspace } from '../workspace/resolve-via-workspace';

/**
 * `permission` asking `workspace` for the folder a `project` rule names — the whole of the coupling
 * between the two ([15 · B-01]).
 *
 * The same four checks as a session's `cwd`: the pure rule, existence, the real path inside a root
 * of this user, and a directory. It does **not** record a use: granting a rule is not opening a
 * workspace, and "last used" would move every time somebody wrote a rule for a folder they never
 * actually open a session in.
 */
@Injectable()
export class WorkspaceModuleRuleFolderResolver implements RuleFolderResolver {
  constructor(
    @Inject(ResolveWorkspaceUseCase) private readonly workspaces: ResolveWorkspaceUseCase,
    @Inject(WORKSPACE_ALLOWLIST_SOURCE) private readonly allowlist: WorkspaceAllowlistSource,
  ) {}

  async resolve(raw: string, userId: UserId): Promise<WorkspacePath> {
    return resolveViaWorkspace(this.workspaces, raw, userId);
  }

  reaches(path: string, userId: UserId): boolean {
    return this.allowlist.current().admits(path, userId);
  }
}
