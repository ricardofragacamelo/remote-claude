import { DomainError } from '@domain/shared';

/**
 * A `Range` that starts past the end of the file — `416`.
 *
 * It carries the size the file has **now**, which the filter puts in the `Content-Range` of the
 * answer — a `*` where the range would be, then the size — as RFC 9110 asks: a hexadecimal view paging through a file that shrank learns where it ends
 * without a second request ([07 · B-47](../../../../../docs/plans/07-explorer-and-editor/F7-previews-and-transfer.md#b-47--o-contrato-de-prévia-e-transferência-)).
 */
export class RangeNotSatisfiableError extends DomainError {
  readonly code = 'RANGE_NOT_SATISFIABLE';
  readonly messageKey = 'files.error.rangeNotSatisfiable';

  constructor(path: string, size: number) {
    super(`${path} has ${String(size)} bytes; the range asked for starts past them`, {
      path,
      size,
    });
  }
}
