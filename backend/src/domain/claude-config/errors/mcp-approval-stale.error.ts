import { DomainError } from '@domain/shared';

/**
 * The entry of `.mcp.json` being approved is not the one the screen showed: the file changed in
 * between (D-11). `409`: approving what nobody saw would be approving another program.
 */
export class McpApprovalStaleError extends DomainError {
  readonly code = 'MCP_APPROVAL_STALE';
  readonly messageKey = 'claudeConfig.error.mcpApprovalStale';

  constructor(folder: string, name: string) {
    super(`the .mcp.json entry ${name} changed since it was shown`, { folder, name });
  }
}
