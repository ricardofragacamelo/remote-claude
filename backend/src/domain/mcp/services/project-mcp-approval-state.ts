/** Where one entry of a project's MCP file stands with this user (plan 13, B-24; D-11). */
export const PROJECT_MCP_APPROVAL_STATES = ['pending', 'approved', 'rejected', 'changed'] as const;
export type ProjectMcpApprovalState = (typeof PROJECT_MCP_APPROVAL_STATES)[number];

/** Our decision on an entry, keyed by the digest it was decided at. */
export interface ProjectMcpDecision {
  readonly decision: 'approved' | 'rejected';
  readonly digest: string;
}

/**
 * The state an entry shows with, from our decision (if any) and the entry's current digest.
 *
 * A rejection holds regardless of what the entry becomes afterwards — rejecting never widens
 * anything, so there is nothing for a later change to invalidate (the same asymmetry D-10 already
 * has for disabling a server of our own store). An approval is narrower: it names the exact digest
 * it was given for, so a `.mcp.json` that changes afterwards — a `git pull` that swaps a command —
 * is "changed", not silently still "approved" (S-103).
 */
export function projectMcpApprovalStateOf(
  currentDigest: string,
  decision: ProjectMcpDecision | null,
): ProjectMcpApprovalState {
  if (decision === null) {
    return 'pending';
  }

  if (decision.decision === 'rejected') {
    return 'rejected';
  }

  return decision.digest === currentDigest ? 'approved' : 'changed';
}
