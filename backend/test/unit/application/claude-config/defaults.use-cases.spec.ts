import { describe, expect, it } from 'vitest';

import { RecordAuditEventUseCase } from '@application/audit';
import {
  ClearFolderDefaultsUseCase,
  ComposeSessionConfigurationUseCase,
  ClaudeInstallationCatalog,
  ReadDefaultsUseCase,
  SaveDefaultsUseCase,
} from '@application/claude-config';
import type {
  ClaudeDefaultsRepository,
  FolderAccess,
  InstallationProbe,
} from '@application/claude-config';
import { UserId } from '@domain/auth';
import { ModelNotAvailableError, NO_DEFAULTS } from '@domain/claude-config';
import type { ClaudeDefaults, FolderDefaults } from '@domain/claude-config';
import { ClaudeUnavailableError } from '@domain/session';
import type { SessionInitialization } from '@domain/session';
import { WorkspacePath, WorkspaceNotAllowedError } from '@domain/workspace';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { RecordingAuditEvents } from '../../../support/fakes/recording-audit-events';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const USER = UserId.create('auth|42');
const ROOT = WorkspacePath.create('/srv');

const INIT: SessionInitialization = {
  commands: [],
  agents: [],
  models: [
    {
      value: 'sonnet',
      resolvedModel: null,
      displayName: 'Sonnet',
      description: '',
      supportsEffort: true,
      supportedEffortLevels: ['low', 'high'],
    },
    {
      value: 'haiku',
      resolvedModel: null,
      displayName: 'Haiku',
      description: '',
      supportsEffort: false,
      supportedEffortLevels: [],
    },
  ],
  outputStyle: 'default',
  outputStyles: ['default', 'Concise'],
  account: {
    email: 'p@example.com',
    organization: null,
    plan: null,
    provider: 'firstParty',
    tokenSource: null,
    apiKeySource: null,
  },
};

/** The defaults of everybody, in memory. */
class InMemoryDefaults implements ClaudeDefaultsRepository {
  readonly rows = new Map<string, ClaudeDefaults>();
  saves = 0;

  read(userId: UserId) {
    const mine = [...this.rows].filter(([key]) => key.startsWith(`${userId.value} `));
    const user = mine.find(([key]) => key.endsWith(' -'))?.[1] ?? null;
    const overrides: FolderDefaults[] = mine
      .filter(([key]) => !key.endsWith(' -'))
      .map(([key, values]) => ({ folder: key.split(' ')[1] ?? '', values }));
    return Promise.resolve({ user, overrides });
  }

  save(userId: UserId, folder: string | null, values: ClaudeDefaults): Promise<void> {
    this.saves += 1;
    this.rows.set(`${userId.value} ${folder ?? '-'}`, values);
    return Promise.resolve();
  }

  remove(userId: UserId, folder: string): Promise<boolean> {
    return Promise.resolve(this.rows.delete(`${userId.value} ${folder}`));
  }
}

const folders: FolderAccess = {
  resolve: (raw) =>
    raw.startsWith('/srv')
      ? Promise.resolve(WorkspacePath.create(raw))
      : Promise.reject(new WorkspaceNotAllowedError(raw)),
  locate: (raw) => Promise.resolve({ folder: WorkspacePath.create(raw), root: ROOT.value }),
  firstRoot: () => Promise.resolve(ROOT),
};

function harness(
  probe: InstallationProbe = {
    probe: () => Promise.resolve({ cliVersion: '2.1.277', initialization: INIT }),
  },
) {
  const events = new RecordingAuditEvents();
  const defaults = new InMemoryDefaults();
  const clock = new FixedClock(new Date('2026-10-09T12:00:00Z'));
  const catalog = new ClaudeInstallationCatalog(
    { initializationOf: () => Promise.resolve(null) },
    probe,
    clock,
    { cliVersion: '2.1.277', configDir: '/home/me/.claude' },
  );
  const deps = {
    defaults,
    folders,
    catalog,
    trail: new RecordAuditEventUseCase(events, new SequentialIds()),
    clock,
  };
  return {
    events,
    defaults,
    catalog,
    read: new ReadDefaultsUseCase(deps),
    save: new SaveDefaultsUseCase(deps),
    clear: new ClearFolderDefaultsUseCase(deps),
    compose: new ComposeSessionConfigurationUseCase(defaults, catalog),
  };
}

const set = (values: Partial<ClaudeDefaults>): ClaudeDefaults => ({ ...NO_DEFAULTS, ...values });

describe('the defaults use cases — plan 13, B-14', () => {
  it('saves the user default, recording it first, and answers what applies — S-37', async () => {
    const h = harness();

    const view = await h.save.execute(USER, null, set({ model: 'sonnet', permissionMode: 'plan' }));

    expect(h.events.kinds).toEqual(['claude.defaultsChanged']);
    expect(h.events.appended[0]?.details).toMatchObject({ changed: ['model', 'permissionMode'] });
    expect(view.effective.model).toEqual({ value: 'sonnet', from: 'user' });
  });

  it('records nothing and writes nothing when the same default is saved again — S-43', async () => {
    const h = harness();
    await h.save.execute(USER, null, set({ thinking: 'off' }));
    await h.save.execute(USER, null, set({ thinking: 'off' }));

    expect(h.events.kinds).toHaveLength(1);
    expect(h.defaults.saves).toBe(1);
  });

  it('saves nothing when the trail cannot take it — S-44', async () => {
    const h = harness();
    h.events.failure = new Error('database gone');

    await expect(h.save.execute(USER, null, set({ thinking: 'on' }))).rejects.toThrow(
      'database gone',
    );
    expect(h.defaults.saves).toBe(0);
  });

  it('refuses a model the installation does not offer, checked now — S-39', async () => {
    await expect(harness().save.execute(USER, null, set({ model: 'gone' }))).rejects.toThrow(
      ModelNotAvailableError,
    );
  });

  it('refuses rather than saving unchecked when the catalogue does not answer — S-47', async () => {
    const h = harness({ probe: () => Promise.reject(new ClaudeUnavailableError('/srv')) });

    await expect(h.save.execute(USER, null, set({ model: 'sonnet' }))).rejects.toThrow(
      ClaudeUnavailableError,
    );
    expect(h.defaults.saves).toBe(0);
    // A default naming no model needs no catalogue, and saves with it down.
    await h.save.execute(USER, null, set({ thinking: 'off' }));
    expect(h.defaults.saves).toBe(1);
  });

  it('saves a folder override, read back with where each field comes from — S-38', async () => {
    const h = harness();
    await h.save.execute(USER, null, set({ model: 'haiku', permissionMode: 'plan' }));
    await h.save.execute(USER, '/srv/repo', set({ model: 'sonnet' }));

    const view = await h.read.execute(USER, '/srv/repo/pkg');

    expect(view.effective.model).toEqual({ value: 'sonnet', from: 'folder', folder: '/srv/repo' });
    expect(view.effective.permissionMode.from).toBe('user');
    expect(view.folder).toBeNull();
    expect((await h.read.execute(USER, '/srv/repo')).folder?.values.model).toBe('sonnet');
    expect((await h.read.execute(USER, null)).user.model).toBe('haiku');
  });

  it('refuses a folder outside the allowlist before anything else — S-46', async () => {
    const h = harness();

    await expect(h.save.execute(USER, '/etc', set({ thinking: 'on' }))).rejects.toThrow(
      WorkspaceNotAllowedError,
    );
    await expect(h.read.execute(USER, '/etc')).rejects.toThrow(WorkspaceNotAllowedError);
    expect(h.events.kinds).toEqual([]);
  });

  it('clears a folder override, recorded, and does nothing for one that was never set', async () => {
    const h = harness();
    await h.save.execute(USER, '/srv/repo', set({ thinking: 'on' }));

    await h.clear.execute(USER, '/srv/repo');
    await h.clear.execute(USER, '/srv/repo');

    expect(h.events.kinds).toEqual(['claude.defaultsChanged', 'claude.defaultsChanged']);
    expect((await h.read.execute(USER, '/srv/repo')).folder).toBeNull();
  });
});

describe('what a session asks — plan 13, B-15', () => {
  it('puts the folder’s defaults together with the client’s choice, checked against what is known', async () => {
    const h = harness();
    await h.save.execute(USER, '/srv/repo', set({ model: 'sonnet', outputStyle: 'Concise' }));
    await h.catalog.of(USER, WorkspacePath.create('/srv/repo'));

    const { defaults } = await h.compose.execute({
      userId: USER,
      workspace: WorkspacePath.create('/srv/repo'),
      client: { model: null, permissionMode: null, effort: null },
      models: null,
    });

    expect(defaults).toMatchObject({
      model: 'sonnet',
      outputStyle: 'Concise',
      from: 'folder',
      stale: [],
    });
  });

  it('checks against the models the session already knows, before the catalogue', async () => {
    const h = harness();
    await h.save.execute(USER, null, set({ model: 'sonnet' }));

    const { defaults } = await h.compose.execute({
      userId: USER,
      workspace: WorkspacePath.create('/srv/repo'),
      client: { model: null, permissionMode: null, effort: null },
      models: [],
    });

    expect(defaults).toMatchObject({ model: null, from: 'installation', stale: ['model'] });
  });
});
