import type { PermissionDecision, PersistedScope } from '../types/permission';
import type { GrantRuleInput, SimulateRulesInput } from '../types/rule';

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

/** "If this rule existed" (D-15, review step): the same draft, read against the last 200
 * invocations of the folder it would reach — every invocation, when `scope` is `always`. */
export function simulationInputOf(args: {
  readonly pattern: string;
  readonly decision: PermissionDecision;
  readonly scope: PersistedScope;
  readonly folder: string | null;
}): SimulateRulesInput {
  return {
    add: [{ pattern: args.pattern, decision: args.decision }],
    ...(args.scope === 'project' && args.folder !== null ? { folder: args.folder } : {}),
    limit: 200,
  };
}
