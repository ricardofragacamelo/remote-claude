import { DomainError } from '@domain/shared';

/** What was measured against the ceiling: the bytes of a file, or the entries of a folder. */
export type SizeMeasure = 'bytes' | 'entries';

/**
 * Above the ceiling — `413`.
 *
 * A file past the editing ceiling, a body past it, or a folder too big to copy. `size` is what was
 * seen, `limit` the ceiling, and the client offers what fits: the paginated read for a file, a
 * smaller selection for a copy ([07 · D-04](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-04--teto-de-tamanho-e-encoding)).
 */
export class FileTooLargeError extends DomainError {
  readonly code = 'FILE_TOO_LARGE';
  readonly messageKey = 'files.error.tooLarge';

  constructor(path: string, size: number, limit: number, measure: SizeMeasure) {
    super(`${path} is ${String(size)} ${measure}, past the ceiling of ${String(limit)}`, {
      path,
      size,
      limit,
      measure,
    });
  }
}
