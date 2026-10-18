import { describe, expect, it } from 'vitest';

import { ComposeSessionConfigurationUseCase, EngineSettings } from '@application/agent-settings';
import { UserId } from '@domain/auth';
import { WorkspacePath } from '@domain/workspace';
import type { InstallationModel } from '@domain/session';
import { FakeEngineModelCatalog } from '../../../support/fakes/engine-model-catalog';
import { InMemoryAgentDefaults } from '../../../support/fakes/in-memory-agent-defaults.repository';

const USER = UserId.create('auth|42');
const ENGINE = 'claude';

const model = (value: string): InstallationModel => ({
  value,
  resolvedModel: null,
  displayName: value,
  description: '',
  supportedEffortLevels: [],
});

const MODELS = [model('sonnet'), model('haiku')];

describe('what a session asks — plan 13, B-15; plan 28, B-36', () => {
  it('puts the folder’s defaults together with the client’s choice, checked against what is known', async () => {
    const defaults = new InMemoryAgentDefaults();
    const catalog = new FakeEngineModelCatalog(ENGINE, { models: MODELS, known: MODELS });
    const compose = new ComposeSessionConfigurationUseCase(defaults, new EngineSettings([catalog]));
    await defaults.save(USER, ENGINE, '/srv/repo', {
      model: 'sonnet',
      permissionMode: null,
      effort: null,
      thinking: null,
      fallbackModel: null,
    });

    const { defaults: applied } = await compose.execute({
      userId: USER,
      engine: ENGINE,
      workspace: WorkspacePath.create('/srv/repo'),
      client: { model: null, permissionMode: null, effort: null },
      models: null,
    });

    expect(applied).toMatchObject({ model: 'sonnet', from: 'folder', stale: [] });
  });

  it('checks against the models the session already knows, before the catalogue', async () => {
    const defaults = new InMemoryAgentDefaults();
    const catalog = new FakeEngineModelCatalog(ENGINE, { models: MODELS, known: MODELS });
    const compose = new ComposeSessionConfigurationUseCase(defaults, new EngineSettings([catalog]));
    await defaults.save(USER, ENGINE, null, {
      model: 'sonnet',
      permissionMode: null,
      effort: null,
      thinking: null,
      fallbackModel: null,
    });

    const { defaults: applied } = await compose.execute({
      userId: USER,
      engine: ENGINE,
      workspace: WorkspacePath.create('/srv/repo'),
      client: { model: null, permissionMode: null, effort: null },
      models: [],
    });

    expect(applied).toMatchObject({ model: null, from: 'installation', stale: ['model'] });
  });

  it('answers the extension’s options beside the defaults, with its stale fields merged in', async () => {
    const defaults = new InMemoryAgentDefaults();
    const catalog = new FakeEngineModelCatalog(ENGINE, { models: MODELS, known: MODELS });
    const compose = new ComposeSessionConfigurationUseCase(defaults, new EngineSettings([catalog]));

    const { outputStyle, stale } = await compose.execute({
      userId: USER,
      engine: ENGINE,
      workspace: WorkspacePath.create('/srv/repo'),
      client: { model: null, permissionMode: null, effort: null },
      models: null,
    });

    // No extension registered for this engine: nothing of the kind is added.
    expect(outputStyle).toBeNull();
    expect(stale).toEqual([]);
  });

  it('opens with the client’s choice alone for an engine this installation keeps no settings for', async () => {
    const defaults = new InMemoryAgentDefaults();
    const compose = new ComposeSessionConfigurationUseCase(defaults, new EngineSettings([]));

    const {
      defaults: applied,
      outputStyle,
      stale,
    } = await compose.execute({
      userId: USER,
      engine: 'codex',
      workspace: WorkspacePath.create('/srv/repo'),
      client: { model: 'gpt', permissionMode: 'acceptEdits', effort: null },
      models: null,
    });

    expect(applied).toMatchObject({ model: 'gpt', permissionMode: 'acceptEdits', from: 'client' });
    expect(outputStyle).toBeNull();
    expect(stale).toEqual([]);
  });
});
