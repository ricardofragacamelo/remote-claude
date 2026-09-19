import type { UserId } from '@domain/auth';
import type { Clock } from '@domain/shared';
import {
  WorkspaceNotADirectoryError,
  WorkspaceNotAllowedError,
  WorkspaceNotFoundError,
  WorkspacePath,
  WorkspaceUsage,
} from '@domain/workspace';
import type { ResolvedWorkspace } from '@domain/workspace';
import type { WorkspaceAllowlistSource } from './ports/workspace-allowlist.port';
import type { WorkspaceDirectoryProbe } from './ports/workspace-directory.probe';
import type { WorkspaceUsageRepository } from './ports/workspace-usage.repository';

/**
 * Turns a path somebody typed into a directory Claude may be started in.
 *
 * This is the gate every session goes through, because `cwd` of the Agent SDK's `query()` **is**
 * the value it produces. The order of the four checks is the design:
 *
 * 1. the pure rule first — absolute, normalised, inside a root of *this* user. No I/O, so a path
 *    that was never going to be allowed costs nothing and touches nothing;
 * 2. then existence, which is the first question that needs the disk;
 * 3. then containment **again**, on the real path. A symlink inside an allowed root pointing
 *    outside it passes step 1 by its name and fails here by its target (S-12);
 * 4. then directory-ness, last, because a file inside a root is the least dangerous of the four.
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
   * @throws {import('@domain/workspace').InvalidWorkspacePathError} empty, relative or NUL-bearing
   * @throws {WorkspaceNotAllowedError} outside every root, or resolving to somewhere outside
   * @throws {WorkspaceNotFoundError} nothing at that path
   * @throws {import('@domain/workspace').WorkspaceForbiddenError} the root is somebody else's
   * @throws {WorkspaceNotADirectoryError} it is a file
   */
  async execute(
    raw: string,
    userId: UserId,
    options: { readonly recordUse: boolean } = { recordUse: false },
  ): Promise<ResolvedWorkspace> {
    const { path, workspace } = this.allowlist.current().resolve(raw, userId);
    const inspection = await this.directories.inspect(path.value);

    if (inspection.kind === 'missing') {
      throw new WorkspaceNotFoundError(path.value);
    }

    const real = WorkspacePath.create(inspection.realPath);

    if (!workspace.contains(real)) {
      throw new WorkspaceNotAllowedError(path.value);
    }

    if (!inspection.isDirectory) {
      throw new WorkspaceNotADirectoryError(path.value);
    }

    if (options.recordUse) {
      await this.usage.record(
        WorkspaceUsage.record(userId, workspace.root, workspace.label, this.clock.now()),
      );
    }

    // The **real** path is what goes on, never the name that was typed: whoever opens it later
    // would otherwise follow a link that could have been repointed in between.
    return { path: real, workspace };
  }
}
