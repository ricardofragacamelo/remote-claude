import type { ResolveWorkspaceUseCase } from '@application/workspace';
import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '@domain/workspace';

/**
 * The one line every module's own folder resolver adapter shares: ask `workspace` to resolve
 * [raw], keep only the real path. `files` and `permission` each wrap this behind their own port
 * (`FolderResolver`, `RuleFolderResolver`) so neither depends on the other's — this is the coupling
 * itself, named once rather than copied.
 */
export async function resolveViaWorkspace(
  workspaces: ResolveWorkspaceUseCase,
  raw: string,
  userId: UserId,
): Promise<WorkspacePath> {
  return (await workspaces.execute(raw, userId)).path;
}
