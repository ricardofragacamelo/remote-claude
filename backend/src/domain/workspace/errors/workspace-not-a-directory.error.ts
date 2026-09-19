import { DomainError } from '@domain/shared';

/**
 * The path exists, is allowed, and is a file.
 *
 * `422` and not `400`: the request was understood perfectly. It is the world that makes it
 * impossible — see docs/architecture/shared/04-errors-and-http.md.
 */
export class WorkspaceNotADirectoryError extends DomainError {
  readonly code = 'WORKSPACE_NOT_A_DIRECTORY';
  readonly messageKey = 'workspace.error.notADirectory';

  constructor(path: string) {
    super(`${path} exists but is not a directory`, { path });
  }
}
