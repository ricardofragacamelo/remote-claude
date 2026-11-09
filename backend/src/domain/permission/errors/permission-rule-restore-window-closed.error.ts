import { DomainError } from '@domain/shared';

/**
 * The undo window after revoking a rule has closed (plan 15, D-11).
 *
 * `410`: the rule existed, the right to undo it does not exist any more, and it does not come
 * back. The path from here is duplicating the revoked rule through the assistant, with its own
 * second step.
 */
export class PermissionRuleRestoreWindowClosedError extends DomainError {
  readonly code = 'PERMISSION_RULE_RESTORE_WINDOW_CLOSED';
  readonly messageKey = 'permission.error.ruleRestoreWindowClosed';

  constructor(readonly ruleId: string) {
    super(`the undo window for revoking rule ${ruleId} has closed`);
  }
}
