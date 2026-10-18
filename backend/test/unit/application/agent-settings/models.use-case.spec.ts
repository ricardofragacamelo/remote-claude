import { describe, expect, it } from 'vitest';

import { EngineSettings, ReadModelsUseCase } from '@application/agent-settings';
import type { FolderAccess } from '@application/agent-settings';
import { AgentSettingsForbiddenError } from '@domain/agent-settings';
import { UserId } from '@domain/auth';
import type { InstallationModel } from '@domain/session';
import { WorkspacePath } from '@domain/workspace';
import { FakeEngineModelCatalog } from '../../../support/fakes/engine-model-catalog';

const USER = UserId.create('auth|42');
const ROOT = WorkspacePath.create('/srv');
const ENGINE = 'claude';

const folders = (root: WorkspacePath | null = ROOT): FolderAccess => ({
  resolve: (raw) => Promise.resolve(WorkspacePath.create(raw)),
  locate: (raw) => Promise.resolve({ folder: WorkspacePath.create(raw), root: '/srv' }),
  firstRoot: () => Promise.resolve(root),
});

const MODELS: InstallationModel[] = [
  {
    value: 'sonnet',
    resolvedModel: null,
    displayName: 'S',
    description: '',
    supportedEffortLevels: [],
  },
];

describe('the models of an engine’s installation — plan 13, B-13; plan 28, B-36', () => {
  it('answers the models of the installation and every mode of the product — S-34', async () => {
    const catalog = new FakeEngineModelCatalog(ENGINE, { models: MODELS, version: '2.1.277' });
    const engines = new EngineSettings([catalog]);
    const use = new ReadModelsUseCase(folders(), engines);

    const view = await use.execute(USER, ENGINE, '/srv/repo');

    expect(view.models.map((model) => model.value)).toEqual(['sonnet']);
    expect(view.permissionModes).toContain('acceptEdits');
    expect((await use.execute(USER, ENGINE, null)).version).toBe('2.1.277');
  });

  it('refuses to somebody with no root at all', async () => {
    const catalog = new FakeEngineModelCatalog(ENGINE, { models: MODELS });
    const use = new ReadModelsUseCase(folders(null), new EngineSettings([catalog]));

    await expect(use.execute(USER, ENGINE, null)).rejects.toThrow(AgentSettingsForbiddenError);
  });

  it('refuses an engine not enabled', async () => {
    const use = new ReadModelsUseCase(folders(), new EngineSettings([]));

    await expect(use.execute(USER, ENGINE, null)).rejects.toThrow(/claude/);
  });
});
