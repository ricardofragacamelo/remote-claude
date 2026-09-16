import { DomainError } from '@domain/shared';

/**
 * The credential was valid and is no longer.
 *
 * Distinct from `UnauthenticatedError` on purpose: this one means "renew and repeat", and a
 * client that cannot tell the two apart either loops renewing or gives up too early.
 */
export class TokenExpiredError extends DomainError {
  readonly code = 'TOKEN_EXPIRED';
  readonly messageKey = 'auth.error.tokenExpired';

  constructor() {
    super('access token has expired');
  }
}
