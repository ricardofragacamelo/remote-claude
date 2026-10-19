import { describe, expect, it } from 'vitest';

import { ownedServer } from '@application/mcp';
import {
  createMcpServerConfig,
  McpServerForbiddenError,
  McpServerNotFoundError,
} from '@domain/mcp';
import type { McpEngineDialect } from '@domain/mcp';
import { UserId } from '@domain/auth';
import { InMemoryMcpServerRepository } from '../../../support/fakes/in-memory-mcp-server.repository';

const DIALECT: McpEngineDialect = {
  engine: 'claude',
  rejectsServerName: () => null,
  reservedEnvNames: [],
};
const OWNER = UserId.create('auth|owner');
const SOMEBODY_ELSE = UserId.create('auth|somebody-else');
const NOW = new Date('2026-10-19T00:00:00Z');

async function seeded(): Promise<{ repository: InMemoryMcpServerRepository; serverId: string }> {
  const repository = new InMemoryMcpServerRepository();
  const config = createMcpServerConfig(
    { name: 'github', scope: 'user', folderPath: null, transport: 'stdio', command: 'npx' },
    DIALECT,
  );
  const server = await repository.insert('srv-1', { userId: OWNER, engine: 'claude', config }, NOW);
  return { repository, serverId: server.id };
}

describe('ownedServer — plan 13, B-19, S-76, S-77', () => {
  it('returns the server when the caller owns it', async () => {
    const { repository, serverId } = await seeded();
    const server = await ownedServer(repository, OWNER, serverId);
    expect(server.id).toBe(serverId);
  });

  it('throws McpServerNotFoundError for an id that does not exist', async () => {
    const { repository } = await seeded();
    await expect(ownedServer(repository, OWNER, 'does-not-exist')).rejects.toThrow(
      McpServerNotFoundError,
    );
  });

  it('throws McpServerForbiddenError for somebody else’s server', async () => {
    const { repository, serverId } = await seeded();
    await expect(ownedServer(repository, SOMEBODY_ELSE, serverId)).rejects.toThrow(
      McpServerForbiddenError,
    );
  });
});
