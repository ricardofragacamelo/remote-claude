/** Public surface of the `workspace` domain. Another domain imports this file, never a deep path. */
export { Workspace } from './entities/workspace.entity';
export type { WorkspaceDeclaration } from './entities/workspace.entity';
export { WorkspaceUsage } from './entities/workspace-usage.entity';
export type { WorkspaceUsageSnapshot } from './entities/workspace-usage.entity';
export { WorkspacePath } from './value-objects/workspace-path.value-object';
export { WorkspaceAllowlist } from './services/workspace-allowlist';
export type { ResolvedWorkspace } from './services/workspace-allowlist';
export { InvalidWorkspacePathError } from './errors/invalid-workspace-path.error';
export type { WorkspacePathRule } from './errors/invalid-workspace-path.error';
export { WorkspaceNotAllowedError } from './errors/workspace-not-allowed.error';
export { WorkspaceForbiddenError } from './errors/workspace-forbidden.error';
export { WorkspaceNotFoundError } from './errors/workspace-not-found.error';
export { WorkspaceNotADirectoryError } from './errors/workspace-not-a-directory.error';
