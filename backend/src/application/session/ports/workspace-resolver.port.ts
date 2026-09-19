import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '@domain/workspace';

/**
 * How `session` asks `workspace` whether a path may be opened.
 *
 * Modules talk through ports, never by calling each other's use cases: the implementation lives in
 * an adapter that calls the `workspace` module, and `session` depends on the question rather than
 * on the answer's owner. See docs/architecture/backend/03-modules.md#fronteiras.
 */
export interface WorkspaceResolver {
  /**
   * @throws {import('@domain/workspace').WorkspaceNotAllowedError} outside every root
   * @throws {import('@domain/workspace').WorkspaceNotFoundError} missing, or somebody else's
   * @throws {import('@domain/workspace').WorkspaceNotADirectoryError} it is a file
   */
  resolve(rawPath: string, userId: UserId): Promise<WorkspacePath>;
}

export const WORKSPACE_RESOLVER = Symbol('WorkspaceResolver');
