import type {
  AgentRisk,
  MemoryFileOrigin,
  ProjectConfigIssueReason,
  ProjectPermissionKind,
} from '../types/project-config';

/** Whether a memory file is actually loaded here — the Memory card's own state word. */
export const MEMORY_STATE_KEYS: Record<'loaded' | 'notLoaded', string> = {
  loaded: 'engines.claude.project.memoryStateLoaded',
  notLoaded: 'engines.claude.project.memoryStateNotLoaded',
};

/** Where a memory file comes from — the badge the Memory card shows. */
export const MEMORY_ORIGIN_KEYS: Record<MemoryFileOrigin, string> = {
  root: 'engines.claude.project.memoryOriginRoot',
  claudeDir: 'engines.claude.project.memoryOriginClaudeDir',
  local: 'engines.claude.project.memoryOriginLocal',
  ancestor: 'engines.claude.project.memoryOriginAncestor',
  user: 'engines.claude.project.memoryOriginUser',
};

/** Whether a memory file's own origin is reachable from inside the chosen folder — `root`, `.claude/`
 * and `CLAUDE.local.md` are; an ancestor's and the user's own are not, and never become a link to the
 * editor (S-150): `workbenchLocation` only ever opens a file this folder's own allowlist reaches. */
export function memoryFileWithinFolder(origin: MemoryFileOrigin): boolean {
  return origin === 'root' || origin === 'claudeDir' || origin === 'local';
}

/** What a subagent's own frontmatter widens — flagged in the Subagents card. */
export const AGENT_RISK_KEYS: Record<AgentRisk, string> = {
  permissionMode: 'engines.claude.project.subagentRiskPermissionMode',
  broadTools: 'engines.claude.project.subagentRiskBroadTools',
  mcpServers: 'engines.claude.project.subagentRiskMcpServers',
};

/** `allow`/`deny` — the Permissions card's own badge. */
export const PERMISSION_KIND_KEYS: Record<ProjectPermissionKind, string> = {
  allow: 'engines.claude.project.permissionKindAllow',
  deny: 'engines.claude.project.permissionKindDeny',
};

/** Why a file this screen tried to read did not parse — shown next to it, never hidden. */
export const PROJECT_ISSUE_KEYS: Record<ProjectConfigIssueReason, string> = {
  malformed: 'engines.claude.project.issueMalformed',
  tooLarge: 'engines.claude.project.issueTooLarge',
  linkEscapesRoot: 'engines.claude.project.issueLinkEscapesRoot',
};
