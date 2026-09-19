import { DomainError } from '@domain/shared';

/**
 * The rule was asked to last longer than the installation allows.
 *
 * Refused rather than quietly truncated. A person who granted an hour and got five minutes will
 * be surprised in the one direction that matters least; a person who granted five minutes and got
 * an hour has authorised something they did not.
 */
export class PermissionRuleExpiryTooLongError extends DomainError {
  readonly code = 'PERMISSION_RULE_EXPIRY_TOO_LONG';
  readonly messageKey = 'permission.error.ruleExpiryTooLong';

  constructor(maxMs: number) {
    super(`a permission rule may not outlive ${String(maxMs)}ms`, { maxMs });
  }
}
