import { DomainError } from '@domain/shared';

/**
 * The rule was asked to expire at or before the moment it was created.
 *
 * A rule that is already over is not a harmless no-op: it would sit in the list marked as expired,
 * telling somebody who looks that they once authorised something they never could have used.
 */
export class PermissionRuleExpiryInvalidError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'permission.error.ruleExpiryInvalid';

  constructor(expiresAt: Date) {
    super(`a permission rule may not expire at ${expiresAt.toISOString()}, before it exists`, {
      expiresAt: expiresAt.toISOString(),
    });
  }
}
