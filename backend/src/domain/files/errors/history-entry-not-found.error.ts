import { DomainError } from '@domain/shared';

/**
 * An entry of the local history that is not there for this caller — `404`.
 *
 * Three causes, one answer: the id was never ours, the purge took it (or its blob), or it lives
 * outside the folder the caller reaches **now**. Telling them apart would tell a caller that a
 * version of a file it cannot reach exists ([07 · D-17](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-17--o-histórico-local)).
 */
export class HistoryEntryNotFoundError extends DomainError {
  readonly code = 'HISTORY_ENTRY_NOT_FOUND';
  readonly messageKey = 'files.error.historyEntryNotFound';

  constructor(entryId: string) {
    super(`history entry ${entryId} is not reachable from the folder asked`, { entryId });
  }
}
