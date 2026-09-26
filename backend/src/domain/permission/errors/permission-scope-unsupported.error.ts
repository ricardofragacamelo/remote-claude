import { DomainError } from '@domain/shared';

/**
 * A scope that cannot be honoured for this invocation.
 *
 * Refused, and deliberately **not** narrowed or widened to something that can. The case that
 * reaches it is a `project` or `always` answer about an invocation whose input has no field a
 * pattern can name: the only rule available would cover the **whole tool**, which is far more than
 * what was approved, and falling back to `once` would tell somebody who tapped "always" something
 * untrue about what they authorised. The person is told, and chooses again.
 */
export class PermissionScopeUnsupportedError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'permission.error.scopeUnsupported';

  constructor(scope: string) {
    super(`permission scope ${scope} cannot be granted for this invocation`, { scope });
  }
}
