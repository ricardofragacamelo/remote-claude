import { DomainError } from '@domain/shared';

/**
 * A token got through validation carrying no usable `sub`.
 *
 * It reads as `UNAUTHENTICATED` on the wire like every other credential failure: the response
 * never says which check failed, only the log does.
 */
export class InvalidUserIdError extends DomainError {
  readonly code = 'UNAUTHENTICATED';
  readonly messageKey = 'auth.error.unauthenticated';

  constructor() {
    super('token carries no usable subject claim');
  }
}
