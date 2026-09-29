import { DomainError } from '@domain/shared';

/**
 * The directory exists, is allowed, and the backend process may not read it (`EACCES`, `EPERM`).
 *
 * `422` and not `403`: the caller's authorisation already passed — the allowlist said yes. It is
 * the filesystem that makes the request impossible, and insisting with another token would not
 * change that. See docs/architecture/shared/04-errors-and-http.md.
 */
export class WorkspaceDirectoryUnreadableError extends DomainError {
  readonly code = 'WORKSPACE_DIRECTORY_UNREADABLE';
  readonly messageKey = 'workspace.error.directoryUnreadable';

  constructor(path: string) {
    super(`${path} exists but this process may not read it`, { path });
  }
}
