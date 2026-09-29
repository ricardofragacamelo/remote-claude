import { DomainError } from '@domain/shared';

/**
 * A new order for the folder tabs that is not an order of the tabs that are open.
 *
 * `409` and not `400`: the list is well formed; it disagrees with the tabs this user has open right
 * now — most often because another window opened or closed one in between. Reading the open tabs
 * again and reordering those resolves it.
 */
export class OpenFoldersOrderConflictError extends DomainError {
  readonly code = 'CONFLICT';
  readonly messageKey = 'workspace.error.openFoldersOrderConflict';

  constructor(requested: number, open: number) {
    super(`an order of ${String(requested)} tabs does not match the ${String(open)} open ones`);
  }
}
