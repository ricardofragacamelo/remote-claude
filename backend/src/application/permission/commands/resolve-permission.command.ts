import type { PermissionDecision, PermissionOrigin } from '@domain/permission';
import type { Answerer } from '../answerable-request';

/** One answer, as it arrived from a client. */
export interface ResolvePermissionCommand extends Answerer {
  readonly decision: PermissionDecision;

  /** Required on a refusal by the contract, and again by the entity. */
  readonly reason: string | null;

  /** Absent means `once`. Only the scopes that die with the session exist in this build. */
  readonly scope: string | null;

  readonly resolvedFrom: PermissionOrigin;
}
