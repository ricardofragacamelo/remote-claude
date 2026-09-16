import { DomainError } from '@domain/shared';

/**
 * No valid credential.
 *
 * `reason` is for the log only — the response body never says which of the validation steps
 * failed, because telling an attacker which one is wrong is telling them what to fix.
 * See docs/architecture/shared/08-authentication.md.
 */
export class UnauthenticatedError extends DomainError {
  readonly code = 'UNAUTHENTICATED';
  readonly messageKey = 'auth.error.unauthenticated';

  constructor(readonly reason: string) {
    super(`authentication failed: ${reason}`);
  }
}
