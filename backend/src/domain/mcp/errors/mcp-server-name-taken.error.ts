import { DomainError } from '@domain/shared';

/**
 * Another server of the same user, in the same scope, has the name. `409`: a conflict with what is
 * stored, which renaming one of them resolves. The name is what the agent calls the server's tools
 * by, so two of them would be one.
 */
export class McpServerNameTakenError extends DomainError {
  readonly code = 'MCP_SERVER_NAME_TAKEN';
  readonly messageKey = 'mcp.error.serverNameTaken';

  constructor(name: string) {
    super(`a server named ${name} already exists in that scope`, { name });
  }
}
