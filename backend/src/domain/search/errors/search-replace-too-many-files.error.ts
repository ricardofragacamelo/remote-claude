import { DomainError } from '@domain/shared';

/** An apply named more files than the ceiling allows — checked before any of them is touched. */
export class SearchReplaceTooManyFilesError extends DomainError {
  readonly code = 'PAYLOAD_TOO_LARGE';
  readonly messageKey = 'search.error.replaceTooManyFiles';

  constructor(limit: number) {
    super(`the apply names more files than the ceiling of ${String(limit)}`, {
      measure: 'files',
      limit,
    });
  }
}
