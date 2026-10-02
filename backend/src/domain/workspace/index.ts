/** Public surface of the `workspace` domain. Another domain imports this file, never a deep path. */
export { Workspace } from './entities/workspace.entity';
export type { WorkspaceDeclaration } from './entities/workspace.entity';
export { WorkspaceUsage } from './entities/workspace-usage.entity';
export type { WorkspaceUsageSnapshot } from './entities/workspace-usage.entity';
export { WorkspaceFolder } from './entities/workspace-folder.entity';
export type { WorkspaceFolderSnapshot } from './entities/workspace-folder.entity';
export {
  OPEN_FOLDERS_LIMIT,
  RECENT_FOLDERS_LIMIT,
  decideOpening,
  orderRecent,
  orderTabs,
  recentBeyondLimit,
  reorderTabs,
} from './services/folder-rules';
export type { OpeningDecision, RecentFolder } from './services/folder-rules';
export { WorkspacePath } from './value-objects/workspace-path.value-object';
export { WorkspaceAllowlist } from './services/workspace-allowlist';
export type { ResolvedWorkspace } from './services/workspace-allowlist';
export {
  DIRECTORY_LISTING_LIMIT,
  DirectoryListingCriteria,
  compareNames,
  listDirectory,
} from './services/directory-listing';
export type {
  DirectoryChild,
  DirectoryEntry,
  DirectoryListing,
  DirectoryListingInput,
} from './services/directory-listing';
export { InvalidWorkspacePathError } from './errors/invalid-workspace-path.error';
export type { WorkspacePathRule } from './errors/invalid-workspace-path.error';
export { WorkspaceNotAllowedError } from './errors/workspace-not-allowed.error';
export { WorkspaceForbiddenError } from './errors/workspace-forbidden.error';
export { WorkspaceNotFoundError } from './errors/workspace-not-found.error';
export { WorkspaceNotADirectoryError } from './errors/workspace-not-a-directory.error';
export { WorkspaceDirectoryUnreadableError } from './errors/workspace-directory-unreadable.error';
export { OpenFoldersLimitReachedError } from './errors/open-folders-limit-reached.error';
export { OpenFoldersOrderConflictError } from './errors/open-folders-order-conflict.error';
