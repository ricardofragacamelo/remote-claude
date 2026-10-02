import { DomainError } from '@domain/shared';

/**
 * An encoding this server does not know — `400`.
 *
 * `INVALID_INPUT`, because the request names something that does not exist, like any malformed
 * field; it is never answered by decoding in some other encoding instead (S-50).
 */
export class UnknownEncodingError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'files.error.unknownEncoding';

  readonly details: readonly { readonly field: string; readonly rule: string }[];

  constructor(encoding: string) {
    super(`${encoding} is not an encoding this server knows`, { encoding });
    this.details = [{ field: 'encoding', rule: 'unknownEncoding' }];
  }
}
