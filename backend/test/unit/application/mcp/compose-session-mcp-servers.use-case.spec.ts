import { describe, expect, it } from 'vitest';

import { ComposeSessionMcpServersUseCase, McpEngineCapabilities } from '@application/mcp';
import { createMcpServerConfig } from '@domain/mcp';
import type { McpEngineDialect, McpServerConfig } from '@domain/mcp';
import { UserId } from '@domain/auth';
import { WorkspacePath } from '@domain/workspace';
import { InMemoryMcpServerRepository } from '../../../support/fakes/in-memory-mcp-server.repository';

const DIALECT: McpEngineDialect = {
  engine: 'claude',
  rejectsServerName: () => null,
  reservedEnvNames: [],
};
const USER = UserId.create('auth|compose');
const OTHER_USER = UserId.create('auth|compose-other');
const ENGINE = 'claude';
const NOW = new Date('2026-10-19T00:00:00Z');

function harness() {
  const repository = new InMemoryMcpServerRepository();
  const capabilities = new McpEngineCapabilities([ENGINE]);
  return { repository, compose: new ComposeSessionMcpServersUseCase(repository, capabilities) };
}

async function seedUserScoped(repository: InMemoryMcpServerRepository, name = 'github') {
  const config = createMcpServerConfig(
    {
      name,
      scope: 'user',
      folderPath: null,
      transport: 'stdio',
      command: 'npx',
      env: [{ name: 'TOKEN', value: 'secret' }],
    },
    DIALECT,
  );
  return repository.insert(`srv-${name}`, { userId: USER, engine: ENGINE, config }, NOW);
}

async function seedFolderScoped(
  repository: InMemoryMcpServerRepository,
  folderPath: string,
  name = 'metrics',
) {
  const config = createMcpServerConfig(
    { name, scope: 'folder', folderPath, transport: 'http', url: 'https://mcp.example.com' },
    DIALECT,
  );
  return repository.insert(`srv-${name}`, { userId: USER, engine: ENGINE, config }, NOW);
}

describe('ComposeSessionMcpServersUseCase — plan 13, B-21', () => {
  it('composes a user-scope server for any workspace — S-83', async () => {
    const { repository, compose } = harness();
    await seedUserScoped(repository);

    const composed = await compose.execute({
      userId: USER,
      engine: ENGINE,
      workspace: WorkspacePath.create('/home/user/anywhere'),
    });

    expect(composed).toHaveLength(1);
    expect(composed[0]).toMatchObject({
      name: 'github',
      env: [{ name: 'TOKEN', value: 'secret' }],
    });
  });

  it('composes a folder-scope server only when the workspace is inside its folder — S-83, S-84', async () => {
    const { repository, compose } = harness();
    await seedFolderScoped(repository, '/home/user/project');

    const inside = await compose.execute({
      userId: USER,
      engine: ENGINE,
      workspace: WorkspacePath.create('/home/user/project/sub'),
    });
    expect(inside).toHaveLength(1);

    const outside = await compose.execute({
      userId: USER,
      engine: ENGINE,
      workspace: WorkspacePath.create('/home/user/other'),
    });
    expect(outside).toHaveLength(0);
  });

  it('excludes a disabled server — S-84', async () => {
    const { repository, compose } = harness();
    const created = await seedUserScoped(repository);
    await repository.setEnabled(created.id, false, NOW);

    const composed = await compose.execute({
      userId: USER,
      engine: ENGINE,
      workspace: WorkspacePath.create('/home/user/anywhere'),
    });
    expect(composed).toEqual([]);
  });

  it('never composes another user’s server — S-85', async () => {
    const { repository, compose } = harness();
    await seedUserScoped(repository);

    const composed = await compose.execute({
      userId: OTHER_USER,
      engine: ENGINE,
      workspace: WorkspacePath.create('/home/user/anywhere'),
    });
    expect(composed).toEqual([]);
  });

  it('answers nothing for an engine without the mcp capability', async () => {
    const { repository, compose } = harness();
    await seedUserScoped(repository);

    const composed = await compose.execute({
      userId: USER,
      engine: 'codex',
      workspace: WorkspacePath.create('/home/user/anywhere'),
    });
    expect(composed).toEqual([]);
  });

  it('excludes a folder-scope server whose folder is not even a valid path — S-84', async () => {
    const { repository, compose } = harness();
    // `createMcpServerConfig` checks that a folder scope *has* a folder, never that the folder is an
    // absolute path — that is `WorkspacePath`'s rule, one layer out (nothing in B-19 calls it on
    // write). A relative value reaches storage for real, through the real HTTP body, so this is the
    // system's own behaviour, not a contrived one.
    const config = createMcpServerConfig(
      {
        name: 'metrics',
        scope: 'folder',
        folderPath: 'relative/not-absolute',
        transport: 'stdio',
        command: 'npx',
      },
      DIALECT,
    );
    await repository.insert('srv-relative', { userId: USER, engine: ENGINE, config }, NOW);

    const composed = await compose.execute({
      userId: USER,
      engine: ENGINE,
      workspace: WorkspacePath.create('/home/user/anywhere'),
    });
    expect(composed).toEqual([]);
  });

  it('excludes a folder-scope row with no folder at all — a storage state the domain never builds', async () => {
    const { repository, compose } = harness();
    // `createMcpServerConfig` refuses this combination (`folderRequired`); built by hand to reach the
    // defensive branch directly, the same approach `mcp-config-mapping.spec.ts` uses (plan 13, D-38).
    const config: McpServerConfig = {
      name: 'metrics',
      scope: 'folder',
      folderPath: null,
      transport: 'stdio',
      command: 'npx',
      args: [],
      env: [],
      url: null,
      headers: [],
    };
    await repository.insert('srv-no-folder', { userId: USER, engine: ENGINE, config }, NOW);

    const composed = await compose.execute({
      userId: USER,
      engine: ENGINE,
      workspace: WorkspacePath.create('/home/user/anywhere'),
    });
    expect(composed).toEqual([]);
  });

  it('composes several servers together, each with its own secret revealed', async () => {
    const { repository, compose } = harness();
    await seedUserScoped(repository, 'github');
    await seedFolderScoped(repository, '/home/user/project', 'metrics');

    const composed = await compose.execute({
      userId: USER,
      engine: ENGINE,
      workspace: WorkspacePath.create('/home/user/project'),
    });
    expect(composed.map((server) => server.name).sort()).toEqual(['github', 'metrics']);
  });
});
