import { DomainError } from '@domain/shared';

/**
 * A scope this build cannot honour.
 *
 * Refused, and deliberately **not** downgraded to `once`. A person who tapped "always" and got
 * "just this once" has been told something untrue about what they authorised — and the direction
 * of that lie is the safe one only until they rely on it. `project` and `always` are persisted
 * rules, and a rule that outlives its session needs the screen that revokes it, which arrives with
 * the rules plan.
 */
export class PermissionScopeUnsupportedError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'permission.error.scopeUnsupported';

  constructor(scope: string) {
    super(`permission scope ${scope} is not available in this build`, { scope });
  }
}
