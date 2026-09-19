import { DomainError } from '@domain/shared';

/**
 * The path does not exist — or it exists and the caller may not know that.
 *
 * Those two are deliberately one answer. A root that exists but belongs to someone else answers
 * `404` and never `403`, because `403` confirms the existence of a path the caller should not be
 * able to discover. See docs/plans/01-live-session/decisions.md#d-13.
 */
export class WorkspaceNotFoundError extends DomainError {
  readonly code = 'WORKSPACE_NOT_FOUND';
  readonly messageKey = 'workspace.error.notFound';

  constructor(path: string) {
    super(`${path} does not exist, or is not the caller's`, { path });
  }
}
