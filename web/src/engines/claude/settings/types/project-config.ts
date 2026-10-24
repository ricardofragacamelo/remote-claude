import type { ProjectConfigViewPayload } from '@remote-claude/contracts';

/** `GET /engines/claude/project-config?folder=` — everything a repository injects into Claude,
 * cross-checked against what the installation actually resolves (plan 13, B-31…B-39). */
export type ProjectConfigView = ProjectConfigViewPayload;
export type MemoryFileView = ProjectConfigViewPayload['memory'][number];
export type ProjectCommandView = ProjectConfigViewPayload['commands'][number];
export type ProjectAgentView = ProjectConfigViewPayload['agents'][number];
export type ProjectOutputStyleEntry = ProjectConfigViewPayload['outputStyles'][number];
export type ProjectHookView = ProjectConfigViewPayload['hooks'][number];
export type ProjectPermissionView = ProjectConfigViewPayload['permissions'][number];
export type ProjectPluginsDeclaration = ProjectConfigViewPayload['plugins'];
export type ProjectConfigIssue = ProjectConfigViewPayload['issues'][number];

export type MemoryFileOrigin = MemoryFileView['origin'];
export type AgentRisk = ProjectAgentView['risks'][number];
export type ProjectPermissionKind = ProjectPermissionView['kind'];
export type ProjectConfigIssueReason = ProjectConfigIssue['reason'];
