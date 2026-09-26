import { DomainError } from '@domain/shared';

/**
 * No rule answers to that id.
 *
 * A record that is not there, and therefore `404`. A rule that exists and belongs to somebody else
 * is a different answer — {@link import('./permission-rule-not-owned.error').PermissionRuleNotOwnedError}
 * — because the product uses the status each thing already has rather than a meaning of its own
 * ([D-17](../../../../../docs/plans/01-live-session/decisions.md)).
 */
export class PermissionRuleNotFoundError extends DomainError {
  readonly code = 'PERMISSION_RULE_NOT_FOUND';
  readonly messageKey = 'permission.error.ruleNotFound';

  constructor(ruleId: string) {
    super(`permission rule ${ruleId} does not exist`, { ruleId });
  }
}
