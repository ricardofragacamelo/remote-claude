import { DomainError } from '@domain/shared';

/**
 * One more folder tab, with the ceiling already reached.
 *
 * `409` and not `400` or `429`: the request is well formed and nothing is being hammered — it
 * conflicts with the tabs this user already has open, and closing one resolves it. `params.limit`
 * says how many are allowed ([06 · D-11](../../../../../docs/plans/06-workbench/decisions.md)).
 */
export class OpenFoldersLimitReachedError extends DomainError {
  readonly code = 'OPEN_FOLDERS_LIMIT_REACHED';
  readonly messageKey = 'workspace.error.openFoldersLimitReached';

  constructor(limit: number) {
    super(`this user already has ${String(limit)} folders open`, { limit });
  }
}
