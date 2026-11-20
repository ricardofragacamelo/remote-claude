import { DomainError } from '@domain/shared';

/**
 * A write failed partway through an apply — the disk refused a write the request had every
 * reason to make (D-05). `INTERNAL_ERROR`, the same class `RewindIncompleteError` uses for the
 * same reason: nobody asked for anything wrong. `applied` is every path already written before
 * the failure, so the client never has to guess what is safe and what still needs a retry
 * (S-89).
 */
export class SearchReplaceApplyFailedError extends DomainError {
  readonly code = 'INTERNAL_ERROR';
  readonly messageKey = 'search.error.replaceApplyFailed';

  constructor(applied: readonly string[]) {
    super(`the apply could not finish — ${String(applied.length)} file(s) already written`, {
      applied,
    });
  }
}
