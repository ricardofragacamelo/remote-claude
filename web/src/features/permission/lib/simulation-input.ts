import type { PermissionDecision } from '../types/permission';
import type { RuleSimulation, SimulateRulesInput } from '../types/rule';

/** How many invocations the simulation reads — default 200, up to the server's own teto, 1000
 * (D-15, S-202). */
export const SIMULATION_LIMITS = [50, 200, 1000] as const;
export type SimulationLimit = (typeof SIMULATION_LIMITS)[number];

/** "If this rule existed", "if I revoke this one (or this lot)" — the same request either way
 * (D-15): `add` for the first, `remove` for the second, never both at once in this feature. */
export interface SimulationScope {
  readonly add?: readonly { pattern: string; decision: PermissionDecision; engine?: string }[];
  readonly remove?: readonly string[];
  readonly folder?: string;
  readonly limit: SimulationLimit;
}

export function simulationRequestOf(scope: SimulationScope): SimulateRulesInput {
  return {
    ...(scope.add === undefined ? {} : { add: scope.add }),
    ...(scope.remove === undefined ? {} : { remove: scope.remove }),
    ...(scope.folder === undefined ? {} : { folder: scope.folder }),
    limit: scope.limit,
  };
}

/** Nothing was read at all — the trail itself is empty, not just unchanged by this rule (S-200). */
export function isEmptyTrail(simulation: RuleSimulation): boolean {
  const { counts, withoutFolder } = simulation;
  return (
    counts.unchanged +
      counts.wouldAutoAllow +
      counts.wouldAutoDeny +
      counts.wouldAsk +
      withoutFolder ===
    0
  );
}
