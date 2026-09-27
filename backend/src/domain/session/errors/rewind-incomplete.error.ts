import { DomainError } from '@domain/shared';

/**
 * An undo stopped short: some paths could not be put back.
 *
 * `INTERNAL_ERROR`, because the person asked for nothing wrong — the disk refused a write the undo
 * had every reason to make. It travels **after** the outcome, which says path by path what went
 * back and what did not; this says whose fault the gap is (S-44, S-62).
 */
export class RewindIncompleteError extends DomainError {
  readonly code = 'INTERNAL_ERROR';
  readonly messageKey = 'session.error.rewindIncomplete';

  constructor(promptId: string, failed: number) {
    super(`the undo to ${promptId} could not put ${String(failed)} path(s) back`, { failed });
  }
}
