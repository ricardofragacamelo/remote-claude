import type { McpServerConfig } from '@domain/mcp';
import type { RevealedMcpServer } from './ports/mcp-server-repository.port';

/**
 * [revealed] as the {@link McpServerConfig} it was built from — shared by what a revert writes back
 * (`mcp-server.use-cases.ts`) and what a session composes before it opens
 * (`compose-session-mcp-servers.use-case.ts`), the only two places a revealed row turns back into a
 * config.
 */
export function configFromRevealed(revealed: RevealedMcpServer): McpServerConfig {
  return {
    name: revealed.name,
    scope: revealed.scope,
    folderPath: revealed.folderPath,
    transport: revealed.transport,
    command: revealed.command,
    args: revealed.args,
    env: revealed.env,
    url: revealed.url,
    headers: revealed.headers,
  };
}
