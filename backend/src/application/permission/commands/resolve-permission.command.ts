import type { PermissionDecision, PermissionOrigin } from '@domain/permission';
import type { Answerer } from '../answerable-request';

/** One answer, as it arrived from a client. */
export interface ResolvePermissionCommand extends Answerer {
  readonly decision: PermissionDecision;

  /** Required on a refusal by the contract, and again by the entity. */
  readonly reason: string | null;

  /**
   * Absent means `once`. `project` and `always` also grant a rule that outlives the session —
   * with the narrowest pattern that covers this invocation, and the configured default lifetime.
   */
  readonly scope: string | null;

  readonly resolvedFrom: PermissionOrigin;
}
