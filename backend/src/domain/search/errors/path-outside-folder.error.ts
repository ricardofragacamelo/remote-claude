import { DomainError } from '@domain/shared';

/**
 * A path in `onlyPaths` (or a result-set input of the replace flow) that resolves outside the
 * open folder.
 *
 * `INVALID_INPUT`, not `WORKSPACE_NOT_ALLOWED`: the folder itself was never in question, one path
 * named inside the request was.
 */
export class PathOutsideFolderError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'search.error.pathOutsideFolder';

  constructor(path: string) {
    super(`path reaches outside the open folder: ${path}`, { path });
  }
}
