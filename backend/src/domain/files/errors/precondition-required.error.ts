import { DomainError } from '@domain/shared';
import type { NotKeptReason } from '../services/local-history';

/**
 * What is missing before the server will touch the disk.
 *
 * - `ifMatchMissing` — a save with no `If-Match`, or with `*`, which in HTTP means "any version"
 *   and here would be the same as sending none: a client that forgot the header would overwrite
 *   Claude's work blind;
 * - `sensitiveFile` — a file that changes what Claude may do, written without the explicit
 *   confirmation ([07 · D-15](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-15--arquivos-que-mudam-a-permissão));
 * - `expectedEntriesMissing` — a recursive delete that does not say how many entries it agreed to;
 * - `notKept` — a delete that asked for the local history and did not fit in it: nothing was
 *   deleted, and the client goes back to the definitive second step
 *   ([07 · D-06](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-06--apagar-definitivo-ou-lixeira)).
 */
export type PreconditionReason =
  'ifMatchMissing' | 'sensitiveFile' | 'expectedEntriesMissing' | 'notKept';

/** `428`: the request is understood, and the server needs one more thing before it acts. */
export class PreconditionRequiredError extends DomainError {
  readonly code = 'PRECONDITION_REQUIRED';
  readonly messageKey = 'files.error.preconditionRequired';

  /** @param why with `notKept`, why the history could not take it: `tooLarge`, `unavailable` */
  constructor(path: string, reason: PreconditionReason, why?: NotKeptReason) {
    super(
      `${path} needs a precondition: ${reason}`,
      why === undefined ? { path, reason } : { path, reason, why },
    );
  }
}
