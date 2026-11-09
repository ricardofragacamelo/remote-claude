import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '@domain/workspace';

/**
 * `permission` asking `workspace` whether a folder may hold a `project` rule, and what it really is.
 *
 * The whole of the coupling between the two modules
 * ([15 · B-01](../../../../../docs/plans/15-rules-management/F0-contract.md#b-01--backend03-modulesmd-a-superfície-nova-do-módulo-permission)) —
 * `permission` never reads the allowlist itself. Asked at creation, never cached: a `project` rule
 * for a folder somebody has already lost access to is still refused the instant it is asked for
 * again.
 */
export interface RuleFolderResolver {
  /**
   * @param raw the folder, absolute, as it arrived from outside — the API, an import, a template
   * @returns its real path, cleared by the allowlist and the disk — the same form a session's
   *   workspace carries, so a rule and a session agree on what a folder is called
   * @throws whatever `ResolveWorkspaceUseCase` refuses it with
   */
  resolve(raw: string, userId: UserId): Promise<WorkspacePath>;

  /**
   * Whether [path] — a `project` rule's own, already stored — is still inside a root `userId` may
   * use, **without touching the disk**: the pure allowlist rule alone ([15 · B-10], `folderReachable`).
   * A path that left the allowlist is still a path; this only asks whether it is still reachable,
   * never whether it still exists.
   */
  reaches(path: string, userId: UserId): boolean;
}

export const RULE_FOLDER_RESOLVER = Symbol('RuleFolderResolver');
