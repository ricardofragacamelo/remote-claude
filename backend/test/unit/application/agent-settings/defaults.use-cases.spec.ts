import { AgentUnavailableError } from '@domain/engine';
import { describe, expect, it } from 'vitest';

import { RecordAuditEventUseCase } from '@application/audit';
import {
  ClearFolderDefaultsUseCase,
  EngineSettings,
  ReadDefaultsUseCase,
  SaveDefaultsUseCase,
} from '@application/agent-settings';
import type { FolderAccess } from '@application/agent-settings';
import { UserId } from '@domain/auth';
import { ModelNotAvailableError, NO_DEFAULTS } from '@domain/agent-settings';
import type { AgentDefaults } from '@domain/agent-settings';
import type { InstallationModel } from '@domain/session';
import { WorkspacePath, WorkspaceNotAllowedError } from '@domain/workspace';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { FakeEngineModelCatalog } from '../../../support/fakes/engine-model-catalog';
import { InMemoryAgentDefaults } from '../../../support/fakes/in-memory-agent-defaults.repository';
import { RecordingAuditEvents } from '../../../support/fakes/recording-audit-events';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const USER = UserId.create('auth|42');
const ROOT = WorkspacePath.create('/srv');
const ENGINE = 'claude';

const model = (value: string): InstallationModel => ({
  value,
  resolvedModel: null,
  displayName: value,
  description: '',
  supportedEffortLevels: [],
});

const MODELS = [model('sonnet'), model('haiku')];

const folders: FolderAccess = {
  resolve: (raw) =>
    raw.startsWith('/srv')
      ? Promise.resolve(WorkspacePath.create(raw))
      : Promise.reject(new WorkspaceNotAllowedError(raw)),
  locate: (raw) => Promise.resolve({ folder: WorkspacePath.create(raw), root: ROOT.value }),
  firstRoot: () => Promise.resolve(ROOT),
};

function harness(models: readonly InstallationModel[] = MODELS) {
  const events = new RecordingAuditEvents();
  const defaults = new InMemoryAgentDefaults();
  const clock = new FixedClock(new Date('2026-10-09T12:00:00Z'));
  const catalog = new FakeEngineModelCatalog(ENGINE, { models });
  const engines = new EngineSettings([catalog]);
  const deps = {
    defaults,
    folders,
    engines,
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
  };
}

const set = (values: Partial<AgentDefaults>): AgentDefaults => ({ ...NO_DEFAULTS, ...values });

describe('the defaults use cases — plan 13, B-14; plan 28, B-36', () => {
  it('saves the user default, recording it first, and answers what applies — S-37', async () => {
    const h = harness();

    const view = await h.save.execute(
      USER,
      ENGINE,
      null,
      set({ model: 'sonnet', permissionMode: 'readOnly' }),
    );

    expect(h.events.kinds).toEqual(['agentSettings.defaultsChanged']);
    expect(h.events.appended[0]?.details).toMatchObject({
      engine: ENGINE,
      changed: ['model', 'permissionMode'],
    });
    expect(view.effective.model).toEqual({ value: 'sonnet', from: 'user' });
  });

  it('records nothing and writes nothing when the same default is saved again — S-43', async () => {
    const h = harness();
    await h.save.execute(USER, ENGINE, null, set({ thinking: 'off' }));
    await h.save.execute(USER, ENGINE, null, set({ thinking: 'off' }));

    expect(h.events.kinds).toHaveLength(1);
    expect(h.defaults.saves).toBe(1);
  });

  it('saves nothing when the trail cannot take it — S-44', async () => {
    const h = harness();
    h.events.failure = new Error('database gone');

    await expect(h.save.execute(USER, ENGINE, null, set({ thinking: 'on' }))).rejects.toThrow(
      'database gone',
    );
    expect(h.defaults.saves).toBe(0);
  });

  it('refuses a model the installation does not offer, checked now — S-39', async () => {
    await expect(
      harness().save.execute(USER, ENGINE, null, set({ model: 'gone' })),
    ).rejects.toThrow(ModelNotAvailableError);
  });

  it('refuses an engine not enabled', async () => {
    await expect(
      harness().save.execute(USER, 'codex', null, set({ thinking: 'off' })),
    ).rejects.toThrow(/codex/);
  });

  it('refuses rather than saving unchecked when the catalogue does not answer — S-47', async () => {
    const h = harness();
    h.catalog.failWith = new AgentUnavailableError('claude', '/srv');

    await expect(h.save.execute(USER, ENGINE, null, set({ model: 'sonnet' }))).rejects.toThrow(
      AgentUnavailableError,
    );
    expect(h.defaults.saves).toBe(0);
    // A default naming no model needs no catalogue, and saves with it down.
    await h.save.execute(USER, ENGINE, null, set({ thinking: 'off' }));
    expect(h.defaults.saves).toBe(1);
  });

  it('saves a folder override, read back with where each field comes from — S-38', async () => {
    const h = harness();
    await h.save.execute(USER, ENGINE, null, set({ model: 'haiku', permissionMode: 'readOnly' }));
    await h.save.execute(USER, ENGINE, '/srv/repo', set({ model: 'sonnet' }));

    const view = await h.read.execute(USER, ENGINE, '/srv/repo/pkg');

    expect(view.effective.model).toEqual({ value: 'sonnet', from: 'folder', folder: '/srv/repo' });
    expect(view.effective.permissionMode.from).toBe('user');
    expect(view.folder).toBeNull();
    expect((await h.read.execute(USER, ENGINE, '/srv/repo')).folder?.values.model).toBe('sonnet');
    expect((await h.read.execute(USER, ENGINE, null)).user.model).toBe('haiku');
  });

  it('refuses a folder outside the allowlist before anything else — S-46', async () => {
    const h = harness();

    await expect(h.save.execute(USER, ENGINE, '/etc', set({ thinking: 'on' }))).rejects.toThrow(
      WorkspaceNotAllowedError,
    );
    await expect(h.read.execute(USER, ENGINE, '/etc')).rejects.toThrow(WorkspaceNotAllowedError);
    expect(h.events.kinds).toEqual([]);
  });

  it('clears a folder override, recorded, and does nothing for one that was never set', async () => {
    const h = harness();
    await h.save.execute(USER, ENGINE, '/srv/repo', set({ thinking: 'on' }));

    await h.clear.execute(USER, ENGINE, '/srv/repo');
    await h.clear.execute(USER, ENGINE, '/srv/repo');

    expect(h.events.kinds).toEqual([
      'agentSettings.defaultsChanged',
      'agentSettings.defaultsChanged',
    ]);
    expect((await h.read.execute(USER, ENGINE, '/srv/repo')).folder).toBeNull();
  });
});
