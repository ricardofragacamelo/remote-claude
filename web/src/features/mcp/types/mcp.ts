import type {
  McpServer,
  McpServerPreviewPayload,
  McpServerTestOutcomePayload,
  McpServerTool,
  ProjectMcpServer,
} from '@remote-claude/contracts';

/** One server of the store, as the screen reads it (plan 13, B-19, B-28). */
export type McpServerView = McpServer;

/** `stdio`, `http` or `sse` — the three transports the neutral protocol defines. */
export type McpTransport = McpServerView['transport'];

/** `connected`, `failed`, `needs-auth`, `pending` or `disabled` (plan 13, B-28, D-45). */
export type McpStatus = McpServerView['status'];

/** `user` (every session) or `folder` (only below one). */
export type McpScope = McpServerView['scope'];

/** One entry of a project's own MCP file, with where it stands (plan 13, B-24). */
export type ProjectMcpServerView = ProjectMcpServer;

/** `pending`, `approved`, `rejected` or `changed` — the project entry's own state (D-11). */
export type ProjectMcpApprovalState = ProjectMcpServerView['state'];

/** The description a save would record — what the second step of the wizard shows (S-68, S-132). */
export type McpServerPreview = McpServerPreviewPayload;

/** What testing a saved server's connection answered (plan 13, B-25). */
export type McpTestOutcome = McpServerTestOutcomePayload;

export type { McpServerTool };

/** One secret field of a write — omitted keeps it, `null` removes it, a string replaces it (S-71). */
export interface McpSecretFieldDraft {
  readonly name: string;
  readonly value?: string | null | undefined;
}

/** The fields a create or an edit sends — the union of `stdio` and `http`/`sse` collapsed. */
export interface McpServerFields {
  readonly name: string;
  readonly scope: McpScope;
  readonly folderPath?: string | null | undefined;
  readonly transport: McpTransport;
  readonly command?: string | undefined;
  readonly args?: readonly string[] | undefined;
  readonly env?: readonly McpSecretFieldDraft[] | undefined;
  readonly url?: string | undefined;
  readonly headers?: readonly McpSecretFieldDraft[] | undefined;
}
