import type { RuleReach, RuleReachKind } from '../types/permission';

/**
 * The reach the card starts on (plan 23, D-09): commands that start the same way when there is such
 * a reach, this very input otherwise, and the whole tool when it is the only one there is.
 */
export function preselectedReach(reaches: readonly RuleReach[]): RuleReach | null {
  const of = (kind: RuleReachKind): RuleReach | undefined =>
    reaches.find((each) => each.reach === kind);

  return of('prefix') ?? of('exact') ?? of('tool') ?? null;
}

/**
 * The rules the second step says it will leave: the patterns of the reach chosen. A server that
 * sends no reaches is read as offering its exact pattern (`offersOf`), so there is always one.
 */
export function patternsToConfirm(reach: RuleReach | null): readonly string[] {
  return reach?.patterns ?? [];
}
