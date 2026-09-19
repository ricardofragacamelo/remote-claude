/** Public surface of the `workspace` use cases. */
export { ListWorkspacesUseCase } from './list-workspaces.use-case';
export { ResolveWorkspaceUseCase } from './resolve-workspace.use-case';
export type { WorkspaceAllowlistSource } from './ports/workspace-allowlist.port';
export { WORKSPACE_ALLOWLIST_SOURCE } from './ports/workspace-allowlist.port';
export type {
  DirectoryInspection,
  WorkspaceDirectoryProbe,
} from './ports/workspace-directory.probe';
export { WORKSPACE_DIRECTORY_PROBE } from './ports/workspace-directory.probe';
export type { WorkspaceUsageRepository } from './ports/workspace-usage.repository';
export { WORKSPACE_USAGE_REPOSITORY } from './ports/workspace-usage.repository';
