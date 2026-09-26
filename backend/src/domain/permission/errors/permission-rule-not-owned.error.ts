import { DomainError } from '@domain/shared';

/**
 * The rule belongs to somebody else.
 *
 * An **authorisation** failure, `403`, with the same code as answering somebody else's request:
 * the credential is good and the caller may still not touch this. Revoking another person's rule
 * would be taking away something they granted, and the refusal leaves the rule applying to its
 * owner exactly as before.
 */
export class PermissionRuleNotOwnedError extends DomainError {
  readonly code = 'PERMISSION_NOT_OWNED';
  readonly messageKey = 'permission.error.ruleNotOwned';

  constructor(ruleId: string) {
    super(`permission rule ${ruleId} belongs to another user`, { ruleId });
  }
}
