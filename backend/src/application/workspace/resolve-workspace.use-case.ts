import type { UserId } from '@domain/auth';
import type { Clock } from '@domain/shared';
import { WorkspaceUsage } from '@domain/workspace';
import type { ResolvedWorkspace } from '@domain/workspace';
import type { WorkspaceAllowlistSource } from './ports/workspace-allowlist.port';
import type { WorkspaceDirectoryProbe } from './ports/workspace-directory.probe';
import type { WorkspaceUsageRepository } from './ports/workspace-usage.repository';
import { resolveFolder } from './resolve-folder';

/**
 * Turns a path somebody typed into a directory Claude may be started in.
 *
 * This is the gate every session goes through, because `cwd` of the Agent SDK's `query()` **is**
 * the value it produces. The four checks, and their order, are {@link resolveFolder}'s.
 */
export class ResolveWorkspaceUseCase {
  constructor(
    private readonly allowlist: WorkspaceAllowlistSource,
    private readonly directories: WorkspaceDirectoryProbe,
    private readonly usage: WorkspaceUsageRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * @param raw the path as it arrived from the outside
   * @param userId who is asking
   * @param options `recordUse` writes the metadata row; a plain check does not
   * @throws whatever {@link resolveFolder} refuses the path with
   */
  async execute(
    raw: string,
    userId: UserId,
    options: { readonly recordUse: boolean } = { recordUse: false },
  ): Promise<ResolvedWorkspace> {
    const resolved = await resolveFolder(this.allowlist.current(), this.directories, raw, userId);

    if (options.recordUse) {
      await this.usage.record(
        WorkspaceUsage.record(
          userId,
          resolved.workspace.root,
          resolved.workspace.label,
          this.clock.now(),
        ),
      );
    }

    return resolved;
  }
}
