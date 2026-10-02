import { DomainError } from '@domain/shared';
import type { FolderNotKeptReason } from '../services/local-history';

/**
 * Deleting a folder that has something in it, without saying how much is meant to go.
 *
 * The count is the second step: the client shows it and sends it back as `expectedEntries`, and
 * only then does anything go ([07 · D-06](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-06--apagar-definitivo-ou-lixeira)).
 * It is capped, so a `node_modules` is never walked to its end just to be refused.
 *
 * A delete that asked for the local history and found the folder did not fit in it answers this
 * too, with `notKept` saying why — `tooMany`, `tooLarge`, `unavailable` — and the count the
 * definitive step needs (F8).
 */
export class DirectoryNotEmptyError extends DomainError {
  readonly code = 'DIRECTORY_NOT_EMPTY';
  readonly messageKey = 'files.error.directoryNotEmpty';

  constructor(
    path: string,
    entryCount: number,
    entryCountCapped: boolean,
    notKept?: FolderNotKeptReason,
  ) {
    super(
      `${path} holds ${String(entryCount)} entries`,
      notKept === undefined
        ? { path, entryCount, entryCountCapped }
        : { path, entryCount, entryCountCapped, notKept },
    );
  }
}
