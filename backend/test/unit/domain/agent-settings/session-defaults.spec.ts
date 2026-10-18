import { describe, expect, it } from 'vitest';

import { defaultsForSession, effectiveDefaults, NO_DEFAULTS } from '@domain/agent-settings';
import type { AgentDefaults, EffectiveDefaults } from '@domain/agent-settings';
import type { InstallationModel } from '@domain/session';

const model = (
  value: string,
  levels: InstallationModel['supportedEffortLevels'] = [],
): InstallationModel => ({
  value,
  resolvedModel: value === 'sonnet' ? 'claude-sonnet-5' : null,
  displayName: value,
  description: '',
  supportedEffortLevels: levels,
});

const MODELS = [
  model('default', ['low', 'high']),
  model('sonnet', ['low', 'medium', 'high']),
  model('haiku'),
];

const set = (values: Partial<AgentDefaults>): AgentDefaults => ({ ...NO_DEFAULTS, ...values });

describe('what a session opens with — plan 13, B-15', () => {
  const effectiveOf = (
    user: Partial<AgentDefaults>,
    folder?: Partial<AgentDefaults>,
  ): EffectiveDefaults =>
    effectiveDefaults({
      user: set(user),
      overrides: folder === undefined ? [] : [{ folder: '/srv/repo', values: set(folder) }],
      folder: '/srv/repo',
    });
  const nothing = { model: null, permissionMode: null, effort: null };

  it('lets the client’s model, mode and effort win over every default — S-48', () => {
    const applied = defaultsForSession(
      effectiveOf({ model: 'haiku', permissionMode: 'readOnly' }),
      MODELS,
      {
        model: 'sonnet',
        permissionMode: 'acceptEdits',
        effort: 'low',
      },
    );

    expect(applied).toMatchObject({
      model: 'sonnet',
      permissionMode: 'acceptEdits',
      effort: 'low',
      from: 'client',
    });
  });

  it('opens as before with no default at all: the installation’s — S-49', () => {
    expect(defaultsForSession(effectiveOf({}), MODELS, nothing)).toEqual({
      ...NO_DEFAULTS,
      from: 'installation',
      stale: [],
    });
  });

  it('says whether the model came from the folder or from the user', () => {
    expect(
      defaultsForSession(effectiveOf({ model: 'haiku' }, { model: 'sonnet' }), MODELS, nothing)
        .from,
    ).toBe('folder');
    expect(defaultsForSession(effectiveOf({ model: 'haiku' }), MODELS, nothing).from).toBe('user');
  });

  it('drops a model the installation no longer has, and says so — S-51', () => {
    const applied = defaultsForSession(
      effectiveOf({ model: 'retired', fallbackModel: 'haiku' }),
      MODELS,
      nothing,
    );

    expect(applied).toMatchObject({
      model: null,
      fallbackModel: 'haiku',
      from: 'installation',
      stale: ['model'],
    });
  });

  it('drops an effort the model does not take, and a fallback equal to the model — S-53', () => {
    const applied = defaultsForSession(
      effectiveOf({ model: 'haiku', effort: 'high', fallbackModel: 'haiku' }),
      MODELS,
      nothing,
    );

    expect(applied).toMatchObject({ effort: null, fallbackModel: null });
    expect(applied.stale).toEqual(['effort', 'fallbackModel']);
  });

  it('drops nothing while the installation is not known yet', () => {
    const applied = defaultsForSession(
      effectiveOf({ model: 'whatever', effort: 'max' }),
      null,
      nothing,
    );

    expect(applied).toMatchObject({ model: 'whatever', effort: 'max', stale: [] });
  });
});
