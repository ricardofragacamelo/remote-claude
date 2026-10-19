import type { UserId } from '@domain/auth';
import type { McpServerConfig } from '@domain/mcp';
import type { WorkspacePath } from '@domain/workspace';

/** What a session asks before it opens: whose, which engine, and where. */
export interface SessionMcpServersRequest {
  readonly userId: UserId;
  readonly engine: string;
  readonly workspace: WorkspacePath;
}

/**
 * How a session asks which MCP servers it opens with (plan 13, B-21, D-01) — a port the session
 * declares, so the session never imports the module that answers it, the same shape
 * {@link import('./session-configuration.source').SessionConfigurationSource} already has (D-03).
 */
export interface SessionMcpServersSource {
  composeFor(request: SessionMcpServersRequest): Promise<readonly McpServerConfig[]>;
}

export const SESSION_MCP_SERVERS_SOURCE = Symbol('SessionMcpServersSource');
