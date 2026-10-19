import { describe, expect, it } from 'vitest';

import { RecordAuditEventUseCase } from '@application/audit';
import {
  CreateMcpServerUseCase,
  DeleteMcpServerUseCase,
  ListMcpServersUseCase,
  McpEngineCapabilities,
  McpEngineDialects,
  PreviewMcpServerUseCase,
  SetMcpServerEnabledUseCase,
  UpdateMcpServerUseCase,
} from '@application/mcp';
import type {
  McpServerDependencies,
  McpServerFieldsInput,
  McpServerRepository,
  RevealedMcpServer,
  StoredMcpServer,
} from '@application/mcp';
import {
  McpEngineNotSupportedError,
  McpServerConfigInvalidError,
  McpServerForbiddenError,
  McpServerNameTakenError,
  McpServerNotFoundError,
} from '@domain/mcp';
import { UserId } from '@domain/auth';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { InMemoryMcpServerRepository } from '../../../support/fakes/in-memory-mcp-server.repository';
import { RecordingAuditEvents } from '../../../support/fakes/recording-audit-events';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const USER = UserId.create('auth|42');
const OTHER_USER = UserId.create('auth|99');
const ENGINE = 'claude';

const STDIO_FIELDS: McpServerFieldsInput = {
  name: 'github',
  scope: 'user',
  folderPath: null,
  transport: 'stdio',
  command: 'npx',
  args: ['-y', 'server-github'],
  env: [{ name: 'GITHUB_TOKEN', value: 'secret-value' }],
};

const REMOTE_FIELDS: McpServerFieldsInput = {
  name: 'metrics',
  scope: 'user',
  folderPath: null,
  transport: 'http',
  url: 'https://mcp.example.com',
};

/** A repository that fails every write with [error] — to prove a non-conflict error is not wrapped. */
class FailingMcpServerRepository implements McpServerRepository {
  constructor(
    private readonly delegate: McpServerRepository,
    private readonly error: Error,
  ) {}

  listFor(...args: Parameters<McpServerRepository['listFor']>) {
    return this.delegate.listFor(...args);
  }

  findById(...args: Parameters<McpServerRepository['findById']>) {
    return this.delegate.findById(...args);
  }

  reveal(...args: Parameters<McpServerRepository['reveal']>) {
    return this.delegate.reveal(...args);
  }

  insert(): Promise<StoredMcpServer> {
    return Promise.reject(this.error);
  }

  update(): Promise<StoredMcpServer> {
    return Promise.reject(this.error);
  }

  setEnabled(...args: Parameters<McpServerRepository['setEnabled']>) {
    return this.delegate.setEnabled(...args);
  }

  delete(...args: Parameters<McpServerRepository['delete']>) {
    return this.delegate.delete(...args);
  }
}

/** A repository whose `reveal()` loses a race and answers `null` for one id that still exists. */
class RevealRacingMcpServerRepository implements McpServerRepository {
  constructor(
    private readonly delegate: McpServerRepository,
    private readonly racingId: string,
  ) {}

  listFor(...args: Parameters<McpServerRepository['listFor']>) {
    return this.delegate.listFor(...args);
  }

  findById(...args: Parameters<McpServerRepository['findById']>) {
    return this.delegate.findById(...args);
  }

  reveal(id: string): Promise<RevealedMcpServer | null> {
    return id === this.racingId ? Promise.resolve(null) : this.delegate.reveal(id);
  }

  insert(...args: Parameters<McpServerRepository['insert']>) {
    return this.delegate.insert(...args);
  }

  update(...args: Parameters<McpServerRepository['update']>) {
    return this.delegate.update(...args);
  }

  setEnabled(...args: Parameters<McpServerRepository['setEnabled']>) {
    return this.delegate.setEnabled(...args);
  }

  delete(...args: Parameters<McpServerRepository['delete']>) {
    return this.delegate.delete(...args);
  }
}

function harness(
  wrap: (base: InMemoryMcpServerRepository) => McpServerRepository = (base) => base,
) {
  const events = new RecordingAuditEvents();
  const base = new InMemoryMcpServerRepository();
  const repository = wrap(base);
  const clock = new FixedClock(new Date('2026-10-19T12:00:00Z'));
  const deps: McpServerDependencies = {
    servers: repository,
    capabilities: new McpEngineCapabilities([ENGINE]),
    dialects: new McpEngineDialects([]),
    trail: new RecordAuditEventUseCase(events, new SequentialIds()),
    ids: new SequentialIds('server-'),
    clock,
  };
  return {
    events,
    repository,
    clock,
    create: new CreateMcpServerUseCase(deps),
    update: new UpdateMcpServerUseCase(deps),
    setEnabled: new SetMcpServerEnabledUseCase(deps),
    remove: new DeleteMcpServerUseCase(deps),
    list: new ListMcpServersUseCase(deps),
    preview: new PreviewMcpServerUseCase(deps),
  };
}

describe('MCP server use cases — plan 13, B-19', () => {
  describe('engine capability gating', () => {
    it('refuses every use case for an engine without the mcp capability', async () => {
      const { create, list, preview } = harness();
      await expect(create.execute(USER, 'codex', STDIO_FIELDS)).rejects.toThrow(
        McpEngineNotSupportedError,
      );
      await expect(list.execute(USER, 'codex')).rejects.toThrow(McpEngineNotSupportedError);
      expect(() => preview.execute('codex', STDIO_FIELDS)).toThrow(McpEngineNotSupportedError);
    });
  });

  describe('PreviewMcpServerUseCase — S-68', () => {
    it('describes a config without storing anything', () => {
      const { preview, repository } = harness();
      const description = preview.execute(ENGINE, STDIO_FIELDS);
      expect(description.messageKey).toBe('mcp.description.stdioAnyFolder');
      expect(repository.listFor(USER, ENGINE)).resolves.toEqual([]);
    });

    it('rejects an invalid config the same way a save would', () => {
      const { preview } = harness();
      expect(() => preview.execute(ENGINE, { ...STDIO_FIELDS, name: 'bad name' })).toThrow(
        McpServerConfigInvalidError,
      );
    });
  });

  describe('CreateMcpServerUseCase — S-69, S-79', () => {
    it('stores the server and records mcp.serverAdded before responding', async () => {
      const { create, events } = harness();
      const server = await create.execute(USER, ENGINE, STDIO_FIELDS);

      expect(server.name).toBe('github');
      expect(events.kinds).toEqual(['mcp.serverAdded']);
      expect(events.appended[0]?.details).toMatchObject({ engine: ENGINE });
    });

    it('never returns a secret value — only names (S-70)', async () => {
      const { create } = harness();
      const server = await create.execute(USER, ENGINE, STDIO_FIELDS);
      expect(server.envNames).toEqual(['GITHUB_TOKEN']);
      expect(JSON.stringify(server)).not.toContain('secret-value');
    });

    it('records only variable names in the trail, never the value', async () => {
      const { create, events } = harness();
      await create.execute(USER, ENGINE, STDIO_FIELDS);
      expect(JSON.stringify(events.appended)).not.toContain('secret-value');
      expect(JSON.stringify(events.appended)).toContain('GITHUB_TOKEN');
    });

    it('rejects a second server with the same name in the same scope', async () => {
      const { create } = harness();
      await create.execute(USER, ENGINE, STDIO_FIELDS);
      await expect(create.execute(USER, ENGINE, STDIO_FIELDS)).rejects.toThrow(
        McpServerNameTakenError,
      );
    });

    it('does not record a second audit event when the name is already taken', async () => {
      const { create, events } = harness();
      await create.execute(USER, ENGINE, STDIO_FIELDS);
      await expect(create.execute(USER, ENGINE, STDIO_FIELDS)).rejects.toThrow();
      expect(events.kinds).toEqual(['mcp.serverAdded']);
    });

    it('rolls back the row when the trail cannot take the add (S-79, fail closed)', async () => {
      const { create, events, repository } = harness();
      events.failure = new Error('trail unavailable');

      await expect(create.execute(USER, ENGINE, STDIO_FIELDS)).rejects.toThrow('trail unavailable');
      expect(await repository.listFor(USER, ENGINE)).toEqual([]);
    });

    it('creates a remote server too — command and args default away cleanly', async () => {
      const { create } = harness();
      const server = await create.execute(USER, ENGINE, REMOTE_FIELDS);
      expect(server).toMatchObject({ transport: 'http', command: null, args: [] });
    });

    it('propagates a repository failure that is not a name conflict, unwrapped', async () => {
      const { repository: base } = harness();
      const create = new CreateMcpServerUseCase({
        servers: new FailingMcpServerRepository(base, new Error('disk full')),
        capabilities: new McpEngineCapabilities([ENGINE]),
        dialects: new McpEngineDialects([]),
        trail: new RecordAuditEventUseCase(new RecordingAuditEvents(), new SequentialIds()),
        ids: new SequentialIds('server-'),
        clock: new FixedClock(new Date('2026-10-19T12:00:00Z')),
      });

      await expect(create.execute(USER, ENGINE, STDIO_FIELDS)).rejects.toThrow('disk full');
    });
  });

  describe('UpdateMcpServerUseCase', () => {
    it('keeps the stored secret value when the update omits it (S-71)', async () => {
      const { create, update, repository } = harness();
      const created = await create.execute(USER, ENGINE, STDIO_FIELDS);

      await update.execute(USER, ENGINE, created.id, {
        ...STDIO_FIELDS,
        args: ['-y', 'server-github', '--verbose'],
        env: [{ name: 'GITHUB_TOKEN' }],
      });

      const revealed = await repository.reveal(created.id);
      expect(revealed?.env).toEqual([{ name: 'GITHUB_TOKEN', value: 'secret-value' }]);
      expect(revealed?.args).toEqual(['-y', 'server-github', '--verbose']);
    });

    it('replaces the secret value when the update gives a new one (S-71)', async () => {
      const { create, update, repository } = harness();
      const created = await create.execute(USER, ENGINE, STDIO_FIELDS);

      await update.execute(USER, ENGINE, created.id, {
        ...STDIO_FIELDS,
        env: [{ name: 'GITHUB_TOKEN', value: 'rotated-value' }],
      });

      expect((await repository.reveal(created.id))?.env).toEqual([
        { name: 'GITHUB_TOKEN', value: 'rotated-value' },
      ]);
    });

    it('removes the secret when the update sets it to null (S-71)', async () => {
      const { create, update, repository } = harness();
      const created = await create.execute(USER, ENGINE, STDIO_FIELDS);

      await update.execute(USER, ENGINE, created.id, {
        ...STDIO_FIELDS,
        env: [{ name: 'GITHUB_TOKEN', value: null }],
      });

      expect((await repository.reveal(created.id))?.env).toEqual([]);
    });

    it('records mcp.serverChanged with the new description', async () => {
      const { create, update, events } = harness();
      const created = await create.execute(USER, ENGINE, STDIO_FIELDS);
      events.appended.length = 0;

      await update.execute(USER, ENGINE, created.id, {
        ...STDIO_FIELDS,
        args: ['-y', 'server-github', '--verbose'],
      });

      expect(events.kinds).toEqual(['mcp.serverChanged']);
    });

    it('rejects updating somebody else’s server', async () => {
      const { create, update } = harness();
      const created = await create.execute(USER, ENGINE, STDIO_FIELDS);
      await expect(update.execute(OTHER_USER, ENGINE, created.id, STDIO_FIELDS)).rejects.toThrow(
        McpServerForbiddenError,
      );
    });

    it('rejects updating a server that does not exist', async () => {
      const { update } = harness();
      await expect(update.execute(USER, ENGINE, 'nope', STDIO_FIELDS)).rejects.toThrow(
        McpServerNotFoundError,
      );
    });

    it('reverts to the previous configuration when the trail cannot take the change', async () => {
      const { create, update, events, repository } = harness();
      const created = await create.execute(USER, ENGINE, STDIO_FIELDS);
      events.failure = new Error('trail unavailable');

      await expect(
        update.execute(USER, ENGINE, created.id, {
          ...STDIO_FIELDS,
          args: ['-y', 'server-github', '--changed'],
        }),
      ).rejects.toThrow('trail unavailable');

      events.failure = null;
      const after = await repository.findById(created.id);
      expect(after?.args).toEqual(['-y', 'server-github']);
    });

    it('renaming into another server’s name is a conflict too', async () => {
      const { create, update } = harness();
      await create.execute(USER, ENGINE, STDIO_FIELDS);
      const other = await create.execute(USER, ENGINE, { ...STDIO_FIELDS, name: 'other' });

      await expect(
        update.execute(USER, ENGINE, other.id, { ...STDIO_FIELDS, name: 'github' }),
      ).rejects.toThrow(McpServerNameTakenError);
    });

    it('propagates a repository failure that is not a name conflict, unwrapped', async () => {
      const { create, repository: base, events } = harness();
      const created = await create.execute(USER, ENGINE, STDIO_FIELDS);
      const update = new UpdateMcpServerUseCase({
        servers: new FailingMcpServerRepository(base, new Error('disk full')),
        capabilities: new McpEngineCapabilities([ENGINE]),
        dialects: new McpEngineDialects([]),
        trail: new RecordAuditEventUseCase(events, new SequentialIds()),
        ids: new SequentialIds('server-'),
        clock: new FixedClock(new Date('2026-10-19T12:00:00Z')),
      });

      await expect(update.execute(USER, ENGINE, created.id, STDIO_FIELDS)).rejects.toThrow(
        'disk full',
      );
    });

    it('does nothing to revert when reveal lost the race and found nothing to restore', async () => {
      const { create, repository: base, events } = harness();
      const created = await create.execute(USER, ENGINE, STDIO_FIELDS);
      events.failure = new Error('trail unavailable');
      const update = new UpdateMcpServerUseCase({
        servers: new RevealRacingMcpServerRepository(base, created.id),
        capabilities: new McpEngineCapabilities([ENGINE]),
        dialects: new McpEngineDialects([]),
        trail: new RecordAuditEventUseCase(events, new SequentialIds()),
        ids: new SequentialIds('server-'),
        clock: new FixedClock(new Date('2026-10-19T12:00:00Z')),
      });

      await expect(
        update.execute(USER, ENGINE, created.id, {
          ...STDIO_FIELDS,
          args: ['-y', 'server-github', '--changed'],
        }),
      ).rejects.toThrow('trail unavailable');

      // Nothing to assert on the row itself — this proves the revert path returns quietly
      // instead of throwing when there was no earlier revealed state to write back.
    });
  });

  describe('SetMcpServerEnabledUseCase — B-19/B-23 boundary', () => {
    it('toggles off and records mcp.serverToggled even when nothing else changes', async () => {
      const { create, setEnabled, events } = harness();
      const created = await create.execute(USER, ENGINE, STDIO_FIELDS);
      events.appended.length = 0;

      const toggled = await setEnabled.execute(USER, ENGINE, created.id, false);
      expect(toggled.enabled).toBe(false);
      expect(events.kinds).toEqual(['mcp.serverToggled']);
    });

    it('is idempotent — enabling an already-enabled server records nothing new (S-92)', async () => {
      const { create, setEnabled, events } = harness();
      const created = await create.execute(USER, ENGINE, STDIO_FIELDS);
      events.appended.length = 0;

      await setEnabled.execute(USER, ENGINE, created.id, true);
      expect(events.kinds).toEqual([]);
    });

    it('keeps the server disabled even if the trail fails on disabling (safe default)', async () => {
      const { create, setEnabled, events, repository } = harness();
      const created = await create.execute(USER, ENGINE, STDIO_FIELDS);
      events.failure = new Error('trail unavailable');

      await expect(setEnabled.execute(USER, ENGINE, created.id, false)).rejects.toThrow();
      events.failure = null;
      expect((await repository.findById(created.id))?.enabled).toBe(false);
    });

    it('reverts enabling when the trail fails (widening is not left standing unaudited)', async () => {
      const { create, setEnabled, events, repository } = harness();
      const created = await create.execute(USER, ENGINE, STDIO_FIELDS);
      await setEnabled.execute(USER, ENGINE, created.id, false);
      events.failure = new Error('trail unavailable');

      await expect(setEnabled.execute(USER, ENGINE, created.id, true)).rejects.toThrow();
      events.failure = null;
      expect((await repository.findById(created.id))?.enabled).toBe(false);
    });
  });

  describe('DeleteMcpServerUseCase — S-78', () => {
    it('removes the server and records mcp.serverRemoved', async () => {
      const { create, remove, events, repository } = harness();
      const created = await create.execute(USER, ENGINE, STDIO_FIELDS);
      events.appended.length = 0;

      await remove.execute(USER, ENGINE, created.id);
      expect(await repository.findById(created.id)).toBeNull();
      expect(events.kinds).toEqual(['mcp.serverRemoved']);
    });

    it('answers MCP_SERVER_NOT_FOUND the second time — nothing left to make idempotent', async () => {
      const { create, remove } = harness();
      const created = await create.execute(USER, ENGINE, STDIO_FIELDS);
      await remove.execute(USER, ENGINE, created.id);

      await expect(remove.execute(USER, ENGINE, created.id)).rejects.toThrow(
        McpServerNotFoundError,
      );
    });

    it('rejects removing somebody else’s server, leaving it in place', async () => {
      const { create, remove, repository } = harness();
      const created = await create.execute(USER, ENGINE, STDIO_FIELDS);

      await expect(remove.execute(OTHER_USER, ENGINE, created.id)).rejects.toThrow(
        McpServerForbiddenError,
      );
      expect(await repository.findById(created.id)).not.toBeNull();
    });
  });

  describe('ListMcpServersUseCase', () => {
    it('lists only the caller’s servers in that engine', async () => {
      const { create, list } = harness();
      await create.execute(USER, ENGINE, STDIO_FIELDS);
      await create.execute(OTHER_USER, ENGINE, { ...STDIO_FIELDS, name: 'other-server' });

      const mine = await list.execute(USER, ENGINE);
      expect(mine).toHaveLength(1);
      expect(mine[0]?.name).toBe('github');
    });
  });
});
