import { DomainError } from '@domain/shared';

/** The rule's status, for the one message every state conflict shares. */
export type PermissionRuleConflictStatus = 'disabled' | 'expired' | 'revoked' | 'active';

/**
 * The rule is not in the state an operation needs: extending the validity of a `disabled`,
 * expired or revoked rule, or restoring one that was never revoked (plan 15).
 */
export class PermissionRuleStateConflictError extends DomainError {
  readonly code = 'PERMISSION_RULE_STATE_CONFLICT';
  readonly messageKey = 'permission.error.ruleStateConflict';

  constructor(
    readonly ruleId: string,
    readonly status: PermissionRuleConflictStatus,
  ) {
    super(`rule ${ruleId} is ${status}, which this operation does not accept`, { status });
  }
}
