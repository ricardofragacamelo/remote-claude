import type { PermissionDecision, PermissionOrigin, RuleReachKind } from '@domain/permission';
import type { Answerer } from '../answerable-request';

/** One answer, as it arrived from a client. */
export interface ResolvePermissionCommand extends Answerer {
  readonly decision: PermissionDecision;

  /** Required on a refusal by the contract, and again by the entity. */
  readonly reason: string | null;

  /**
   * Absent means `once`. `session` leaves rules that die with the session; `project` and `always`
   * grant rules that outlive it, with the configured default lifetime — the patterns of `reach`.
   */
  readonly scope: string | null;

  /**
   * Which of the request's reaches those rules take (plan 23, B-10). Absent means `exact`. Never a
   * pattern: the patterns are computed again from the request, and a reach it does not have is
   * refused.
   */
  readonly reach?: RuleReachKind | null;

  readonly resolvedFrom: PermissionOrigin;
}
