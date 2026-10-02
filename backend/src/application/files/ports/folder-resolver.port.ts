import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '@domain/workspace';

/**
 * `files` asking `workspace` whether a folder may be opened, and what it really is.
 *
 * The whole of the coupling between the two modules: `files` never reads the allowlist itself, and
 * `workspace` never learns what a file is ([07 · D-01](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-01--módulo-novo-ou-extensão-do-workspace)).
 * Asked at **every** operation, never cached: a folder that left the allowlist in a reload, or the
 * disk, is refused by the very next request (S-26, S-27).
 */
export interface FolderResolver {
  /**
   * @param raw the folder of the tab, absolute, as it arrived from the outside
   * @returns its real path, cleared by the allowlist and the disk
   * @throws whatever `ResolveWorkspaceUseCase` refuses it with
   */
  resolve(raw: string, userId: UserId): Promise<WorkspacePath>;
}

export const FOLDER_RESOLVER = Symbol('FolderResolver');
