import type { PermissionDecision, PersistedScope } from '../types/permission';
import type { GrantRuleInput } from '../types/rule';

/**
 * `POST /permission-rules`'s own input, built once from the review step's draft — `acknowledgeBroad`
 * sent only for a `broad` width (D-09): Confirm is disabled until the checkbox is checked for one,
 * so by the time this is ever called for a `broad` draft, the acknowledgement is already true.
 */
export function grantInputOf(args: {
  readonly pattern: string;
  readonly decision: PermissionDecision;
  readonly scope: PersistedScope;
  readonly folder: string | null;
  readonly expiresAt: string;
  readonly breadthIsBroad: boolean;
}): GrantRuleInput {
  return {
    pattern: args.pattern,
    decision: args.decision,
    scope: args.scope,
    expiresAt: args.expiresAt,
    ...(args.scope === 'project' && args.folder !== null ? { projectPath: args.folder } : {}),
    ...(args.breadthIsBroad ? { acknowledgeBroad: true } : {}),
  };
}
