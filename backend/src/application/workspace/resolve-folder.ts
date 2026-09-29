import type { UserId } from '@domain/auth';
import {
  WorkspaceNotADirectoryError,
  WorkspaceNotAllowedError,
  WorkspaceNotFoundError,
  WorkspacePath,
} from '@domain/workspace';
import type { ResolvedWorkspace, WorkspaceAllowlist } from '@domain/workspace';
import type { WorkspaceDirectoryProbe } from './ports/workspace-directory.probe';

/**
 * Turns a path somebody sent into a directory of theirs, or refuses it — the gate every route of
 * this module that names a folder goes through.
 *
 * It is a function and not a use case because three use cases need it — resolving, listing and
 * opening a folder — and a use case calling another is a chain nobody unwinds. The order of the
 * four checks is the design:
 *
 * 1. the pure rule first — absolute, normalised, inside a root of *this* user. No I/O, so a path
 *    that was never going to be allowed costs nothing and touches nothing;
 * 2. then existence, which is the first question that needs the disk;
 * 3. then containment **again**, on the real path. A symlink inside an allowed root pointing
 *    outside it passes step 1 by its name and fails here by its target;
 * 4. then directory-ness, last, because a file inside a root is the least dangerous of the four.
 *
 * @param allowlist the list as it is **now** — the caller reads it at every use, never once
 * @throws {import('@domain/workspace').InvalidWorkspacePathError} empty, relative or NUL-bearing
 * @throws {WorkspaceNotAllowedError} outside every root, or resolving to somewhere outside
 * @throws {import('@domain/workspace').WorkspaceForbiddenError} the root is somebody else's
 * @throws {WorkspaceNotFoundError} nothing at that path
 * @throws {WorkspaceNotADirectoryError} it is a file
 */
export async function resolveFolder(
  allowlist: WorkspaceAllowlist,
  directories: WorkspaceDirectoryProbe,
  raw: string,
  userId: UserId,
): Promise<ResolvedWorkspace> {
  const { path, workspace } = allowlist.resolve(raw, userId);
  const inspection = await directories.inspect(path.value);

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

  // The **real** path is what goes on, never the name that was typed: whoever opens it later would
  // otherwise follow a link that could have been repointed in between.
  return { path: real, workspace };
}
