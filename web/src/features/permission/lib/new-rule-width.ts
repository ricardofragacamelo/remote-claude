import type { PermissionDecision } from '../types/permission';
import type { RulePreview } from '../types/rule';

/** What the width of a draft means for submitting it (D-09): `unbounded` is the server's own
 * refusal for `allow` — never offered a way past it in the wizard — and `broad` needs an explicit
 * `acknowledgeBroad` first, for either decision (plan 15, B-27, review step). */
export function widthGate(
  decision: PermissionDecision,
  breadth: RulePreview['breadth'],
  acknowledgeBroad: boolean,
): { readonly blocked: boolean; readonly needsAcknowledge: boolean } {
  return {
    blocked: decision === 'allow' && breadth === 'unbounded',
    needsAcknowledge: breadth === 'broad' && !acknowledgeBroad,
  };
}
