/** Public surface of the `workspace` use cases. */
export { ListWorkspacesUseCase } from './list-workspaces.use-case';
export { ResolveWorkspaceUseCase } from './resolve-workspace.use-case';
export { ListDirectoriesUseCase } from './list-directories.use-case';
export type { ListDirectoriesQuery } from './list-directories.use-case';
export {
  CloseFolderUseCase,
  ListOpenFoldersUseCase,
  OpenFolderUseCase,
  ReorderOpenFoldersUseCase,
} from './open-folders.use-cases';
export type { OpenFolderResult } from './open-folders.use-cases';
export {
  ForgetRecentFolderUseCase,
  ListRecentFoldersUseCase,
  PinRecentFolderUseCase,
} from './recent-folders.use-cases';
export type { RecentFolderView } from './recent-folders.use-cases';
export { RevalidatedFolders } from './folder-view';
export type { FolderState, FolderView, FoldersOfUser } from './folder-view';
export type { WorkspaceAllowlistSource } from './ports/workspace-allowlist.port';
export { WORKSPACE_ALLOWLIST_SOURCE } from './ports/workspace-allowlist.port';
export type {
  DirectoryInspection,
  WorkspaceDirectoryProbe,
} from './ports/workspace-directory.probe';
export { WORKSPACE_DIRECTORY_PROBE } from './ports/workspace-directory.probe';
export type { DirectoryRead, WorkspaceDirectoryLister } from './ports/workspace-directory.lister';
export { WORKSPACE_DIRECTORY_LISTER } from './ports/workspace-directory.lister';
export type {
  FolderLimits,
  FolderVisit,
  OpenedFolder,
  WorkspaceFolderRepository,
} from './ports/workspace-folder.repository';
export { WORKSPACE_FOLDER_REPOSITORY } from './ports/workspace-folder.repository';
export type { WorkspaceUsageRepository } from './ports/workspace-usage.repository';
export { WORKSPACE_USAGE_REPOSITORY } from './ports/workspace-usage.repository';
