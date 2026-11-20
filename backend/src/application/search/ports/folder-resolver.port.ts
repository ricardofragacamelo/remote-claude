import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '@domain/workspace';

/**
 * `search` asking `workspace` whether a folder may be opened, and what it really is — its own
 * declaration of the same port `files` has, so neither module depends on the other
 * (docs/architecture/backend/03-modules.md#search). Asked at **every** request, never cached: a
 * folder that left the allowlist is refused by the very next one, and the locator's own cache
 * (D-07) is consulted only **after** this resolves.
 */
export interface FolderResolver {
  /**
   * @param raw the folder of the tab, absolute, as it arrived from the outside
   * @returns its real path, cleared by the allowlist and the disk
   * @throws whatever `ResolveWorkspaceUseCase` refuses it with
   */
  resolve(raw: string, userId: UserId): Promise<WorkspacePath>;
}

export const SEARCH_FOLDER_RESOLVER = Symbol('SearchFolderResolver');
