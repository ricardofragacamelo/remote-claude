import { DomainError } from '@domain/shared';

/**
 * An `include` or `exclude` glob that reaches outside the open folder — `../`, an absolute path,
 * or a glob the engine would otherwise resolve past the boundary.
 *
 * `INVALID_INPUT`, not `WORKSPACE_NOT_ALLOWED`: nothing asked to open a different folder, a glob
 * of this search tried to see past the one already open.
 */
export class GlobOutsideFolderError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'search.error.globOutsideFolder';

  constructor(field: 'include' | 'exclude', glob: string) {
    super(`${field} glob reaches outside the open folder: ${glob}`, { field, glob });
  }
}
