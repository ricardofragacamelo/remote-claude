import { McpServerForbiddenError, McpServerNotFoundError } from '@domain/mcp';
import type { UserId } from '@domain/auth';
import type { McpServerRepository, StoredMcpServer } from './ports/mcp-server-repository.port';

/**
 * The server with that id, provided it is the caller's — the same two questions, in the same order,
 * every route that touches one server asks (plan 13, B-19, S-76, S-77).
 *
 * @throws {McpServerNotFoundError} no server with that id
 * @throws {McpServerForbiddenError} somebody else's server
 */
export async function ownedServer(
  servers: McpServerRepository,
  userId: UserId,
  serverId: string,
): Promise<StoredMcpServer> {
  const server = await servers.findById(serverId);

  if (server === null) {
    throw new McpServerNotFoundError(serverId);
  }

  if (!server.userId.equals(userId)) {
    throw new McpServerForbiddenError();
  }

  return server;
}
