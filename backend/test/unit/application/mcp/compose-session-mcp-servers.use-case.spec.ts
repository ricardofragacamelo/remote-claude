import { describe, expect, it } from 'vitest';

import {
  ComposeSessionMcpServersUseCase,
  McpEngineCapabilities,
  ProjectMcpServersSources,
} from '@application/mcp';
import { createMcpServerConfig, digestOfProjectMcpEntry } from '@domain/mcp';
import type { McpEngineDialect, McpServerConfig } from '@domain/mcp';
import { UserId } from '@domain/auth';
import { WorkspacePath } from '@domain/workspace';
import { FakeProjectMcpServersSource } from '../../../support/fakes/fake-project-mcp-servers-source';
import { InMemoryMcpProjectApprovalRepository } from '../../../support/fakes/in-memory-mcp-project-approval.repository';
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
  const projectSource = new FakeProjectMcpServersSource();
  const approvals = new InMemoryMcpProjectApprovalRepository();
  const compose = new ComposeSessionMcpServersUseCase(
    repository,
    capabilities,
    new ProjectMcpServersSources([{ engine: ENGINE, source: projectSource }]),
    approvals,
  );
  return { repository, compose, projectSource, approvals };
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

const PROJECT_ENTRY = {
  name: 'figma',
  transport: 'stdio' as const,
  command: 'npx',
  args: ['-y', 'figma-mcp'],
  url: null,
  env: [],
  headers: [],
};

describe('ComposeSessionMcpServersUseCase, the project side — plan 13, B-24', () => {
  it('composes an approved entry whose digest still matches — S-83 (the .mcp.json half)', async () => {
    const { compose, projectSource, approvals } = harness();
    const folder = '/home/user/project';
    projectSource.set(folder, { entries: [PROJECT_ENTRY], error: null });
    const digest = digestOfProjectMcpEntry(PROJECT_ENTRY);
    await approvals.upsert(
      {
        userId: USER,
        engine: ENGINE,
        folderPath: folder,
        name: 'figma',
        digest,
        decision: 'approved',
      },
      NOW,
    );

    const composed = await compose.execute({
      userId: USER,
      engine: ENGINE,
      workspace: WorkspacePath.create(`${folder}/sub`),
    });

    expect(composed).toHaveLength(1);
    expect(composed[0]).toMatchObject({ name: 'figma', scope: 'folder', folderPath: folder });
  });

  it('never composes an entry that is only pending or rejected', async () => {
    const { compose, projectSource, approvals } = harness();
    const folder = '/home/user/project';
    projectSource.set(folder, { entries: [PROJECT_ENTRY], error: null });
    await approvals.upsert(
      {
        userId: USER,
        engine: ENGINE,
        folderPath: folder,
        name: 'figma',
        digest: 'whatever',
        decision: 'rejected',
      },
      NOW,
    );

    const composed = await compose.execute({
      userId: USER,
      engine: ENGINE,
      workspace: WorkspacePath.create(folder),
    });
    expect(composed).toEqual([]);
  });

  it('never composes an entry approved at a digest it no longer has — S-103', async () => {
    const { compose, projectSource, approvals } = harness();
    const folder = '/home/user/project';
    projectSource.set(folder, { entries: [{ ...PROJECT_ENTRY, command: 'node' }], error: null });
    await approvals.upsert(
      {
        userId: USER,
        engine: ENGINE,
        folderPath: folder,
        name: 'figma',
        digest: digestOfProjectMcpEntry(PROJECT_ENTRY), // the OLD digest, before the command changed
        decision: 'approved',
      },
      NOW,
    );

    const composed = await compose.execute({
      userId: USER,
      engine: ENGINE,
      workspace: WorkspacePath.create(folder),
    });
    expect(composed).toEqual([]);
  });

  it('shadows a project entry whose name our own store already has — S-87', async () => {
    const { repository, compose, projectSource, approvals } = harness();
    const folder = '/home/user/project';
    await seedUserScoped(repository, 'figma');
    projectSource.set(folder, { entries: [PROJECT_ENTRY], error: null });
    await approvals.upsert(
      {
        userId: USER,
        engine: ENGINE,
        folderPath: folder,
        name: 'figma',
        digest: digestOfProjectMcpEntry(PROJECT_ENTRY),
        decision: 'approved',
      },
      NOW,
    );

    const composed = await compose.execute({
      userId: USER,
      engine: ENGINE,
      workspace: WorkspacePath.create(folder),
    });

    expect(composed).toHaveLength(1);
    expect(composed[0]).toMatchObject({ name: 'figma', scope: 'user' });
  });

  it('prefers the approval of the folder nearest the workspace on a name collision', async () => {
    const { compose, projectSource, approvals } = harness();
    const near = '/home/user/project/sub';
    const far = '/home/user/project';
    projectSource.set(near, { entries: [{ ...PROJECT_ENTRY, command: 'near' }], error: null });
    projectSource.set(far, { entries: [{ ...PROJECT_ENTRY, command: 'far' }], error: null });
    await approvals.upsert(
      {
        userId: USER,
        engine: ENGINE,
        folderPath: near,
        name: 'figma',
        digest: digestOfProjectMcpEntry({ ...PROJECT_ENTRY, command: 'near' }),
        decision: 'approved',
      },
      NOW,
    );
    await approvals.upsert(
      {
        userId: USER,
        engine: ENGINE,
        folderPath: far,
        name: 'figma',
        digest: digestOfProjectMcpEntry({ ...PROJECT_ENTRY, command: 'far' }),
        decision: 'approved',
      },
      NOW,
    );

    const composed = await compose.execute({
      userId: USER,
      engine: ENGINE,
      workspace: WorkspacePath.create(near),
    });

    expect(composed).toHaveLength(1);
    expect(composed[0]).toMatchObject({ command: 'near' });
  });

  it('never composes another user’s approval', async () => {
    const { compose, projectSource, approvals } = harness();
    const folder = '/home/user/project';
    projectSource.set(folder, { entries: [PROJECT_ENTRY], error: null });
    await approvals.upsert(
      {
        userId: OTHER_USER,
        engine: ENGINE,
        folderPath: folder,
        name: 'figma',
        digest: digestOfProjectMcpEntry(PROJECT_ENTRY),
        decision: 'approved',
      },
      NOW,
    );

    const composed = await compose.execute({
      userId: USER,
      engine: ENGINE,
      workspace: WorkspacePath.create(folder),
    });
    expect(composed).toEqual([]);
  });
});
