import { WorkspacePath } from '@domain/workspace';

/**
 * Whether `candidate`'s own (already-resolved) path is `root`, or lives under it — the one
 * containment check every reader of this extension's project/config files shares: `.mcp.json`'s own
 * climb (B-24), the project's `.claude/` (B-31), and the synthetic skills plugin's sources (B-35).
 */
export function isWithinRoot(candidate: string, root: string): boolean {
  return WorkspacePath.create(candidate).isWithin(WorkspacePath.create(root));
}
