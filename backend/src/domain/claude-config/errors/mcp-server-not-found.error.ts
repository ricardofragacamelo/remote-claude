import { DomainError } from '@domain/shared';

/**
 * A server of the store that does not exist — or a name a live session does not have. `404`: the
 * thing is not there; a server of somebody else is `FORBIDDEN`, and says so.
 */
export class McpServerNotFoundError extends DomainError {
  readonly code = 'MCP_SERVER_NOT_FOUND';
  readonly messageKey = 'claudeConfig.error.mcpServerNotFound';

  constructor(serverId: string) {
    super(`server ${serverId} does not exist`, { serverId });
  }
}
