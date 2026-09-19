import type { UserId } from '@domain/auth';
import type { Workspace } from '@domain/workspace';
import type { WorkspaceAllowlistSource } from './ports/workspace-allowlist.port';
import type { WorkspaceUsageRepository } from './ports/workspace-usage.repository';

/**
 * The roots this user may open, and when they last opened each.
 *
 * It does **not** walk the disk. The allowlist is the source of what exists as far as this product
 * is concerned, and scanning a filesystem on every request would be both the most expensive thing
 * the endpoint does and a way to learn what is on a machine without opening anything.
 */
export class ListWorkspacesUseCase {
  constructor(
    private readonly allowlist: WorkspaceAllowlistSource,
    private readonly usage: WorkspaceUsageRepository,
  ) {}

  async execute(userId: UserId): Promise<readonly Workspace[]> {
    const allowed = this.allowlist.current().for(userId);
    const used = await this.usage.findByUser(userId);
    const lastUsed = new Map(used.map((entry) => [entry.root.value, entry.lastUsedAt]));

    return allowed.map((workspace) => workspace.usedAt(lastUsed.get(workspace.root.value) ?? null));
  }
}
