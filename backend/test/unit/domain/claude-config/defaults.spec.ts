import { describe, expect, it } from 'vitest';

import {
  accountStateOf,
  ClaudeConfigInputInvalidError,
  DefaultModeNotAllowedError,
  defaultsForSession,
  effectiveDefaults,
  isWithin,
  ModelNotAvailableError,
  nearestOverride,
  needsCatalogue,
  NO_DEFAULTS,
  sameDefaults,
  validateDefaults,
  valuesOf,
} from '@domain/claude-config';
import type { ClaudeDefaults, EffectiveDefaults } from '@domain/claude-config';
import type { InstallationModel } from '@domain/session';

const model = (
  value: string,
  levels: InstallationModel['supportedEffortLevels'] = [],
): InstallationModel => ({
  value,
  resolvedModel: value === 'sonnet' ? 'claude-sonnet-5' : null,
  displayName: value,
  description: '',
  supportsEffort: levels.length > 0,
  supportedEffortLevels: levels,
});

const MODELS = [
  model('default', ['low', 'high']),
  model('sonnet', ['low', 'medium', 'high']),
  model('haiku'),
];

const set = (values: Partial<ClaudeDefaults>): ClaudeDefaults => ({ ...NO_DEFAULTS, ...values });

describe('where a default applies — plan 13, D-04', () => {
  it('reads a folder as within itself and its subfolders, by segment — never by prefix', () => {
    expect(isWithin('/srv/repo', '/srv/repo')).toBe(true);
    expect(isWithin('/srv/repo/a/b', '/srv/repo')).toBe(true);
    expect(isWithin('/srv/repo/a', '/srv/repo/')).toBe(true);
    expect(isWithin('/srv/repo-old', '/srv/repo')).toBe(false);
    expect(isWithin('/anything', '/')).toBe(true);
  });

  it('takes the override of the folder itself, or its nearest ancestor that has one — S-38', () => {
    const overrides = [
      { folder: '/srv', values: set({ model: 'haiku' }) },
      { folder: '/srv/repo', values: set({ model: 'sonnet' }) },
    ];

    expect(nearestOverride(overrides, '/srv/repo/pkg')?.folder).toBe('/srv/repo');
    expect(nearestOverride(overrides, '/srv/other')?.folder).toBe('/srv');
    expect(nearestOverride(overrides, '/home')).toBeNull();
    expect(nearestOverride(overrides, null)).toBeNull();
  });

  it('puts the nearest folder over the user over the installation, field by field — S-37, S-38', () => {
    const effective = effectiveDefaults({
      user: set({ model: 'haiku', permissionMode: 'plan' }),
      overrides: [{ folder: '/srv/repo', values: set({ model: 'sonnet', effort: 'high' }) }],
      folder: '/srv/repo/pkg',
    });

    expect(effective.model).toEqual({ value: 'sonnet', from: 'folder', folder: '/srv/repo' });
    expect(effective.permissionMode).toEqual({ value: 'plan', from: 'user' });
    expect(effective.thinking).toEqual({ value: null, from: 'installation' });
    expect(valuesOf(effective)).toEqual(
      set({ model: 'sonnet', permissionMode: 'plan', effort: 'high' }),
    );
  });

  it('applies the user default alone, with no folder in view, and nothing without any', () => {
    expect(effectiveDefaults({ user: null, overrides: [], folder: null }).model.from).toBe(
      'installation',
    );
    expect(
      effectiveDefaults({ user: set({ model: 'haiku' }), overrides: [], folder: null }).model,
    ).toEqual({
      value: 'haiku',
      from: 'user',
    });
  });

  it('tells two defaults that set the same thing from two that do not — S-43', () => {
    expect(sameDefaults(set({ model: 'x' }), set({ model: 'x' }))).toBe(true);
    expect(sameDefaults(set({ model: 'x' }), set({ model: 'y' }))).toBe(false);
  });
});

describe('what a default may set — plan 13, B-14', () => {
  it('needs the catalogue only for what names a model or an effort', () => {
    expect(needsCatalogue(set({ permissionMode: 'plan', thinking: 'off' }))).toBe(false);
    expect(needsCatalogue(set({ effort: 'low' }))).toBe(true);
    expect(needsCatalogue(set({ fallbackModel: 'haiku' }))).toBe(true);
  });

  it('accepts what the installation offers, by value or by the id an alias resolves to', () => {
    expect(() => {
      validateDefaults(
        set({ model: 'claude-sonnet-5', effort: 'medium', fallbackModel: 'haiku' }),
        MODELS,
      );
    }).not.toThrow();
  });

  it('refuses bypassPermissions as a default — S-40', () => {
    expect(() => {
      validateDefaults({ ...NO_DEFAULTS, permissionMode: 'bypassPermissions' } as never, MODELS);
    }).toThrow(DefaultModeNotAllowedError);
  });

  it('refuses a model or a fallback the installation does not offer — S-39', () => {
    expect(() => {
      validateDefaults(set({ model: 'gone' }), MODELS);
    }).toThrow(ModelNotAvailableError);
    expect(() => {
      validateDefaults(set({ fallbackModel: 'gone' }), MODELS);
    }).toThrow(ModelNotAvailableError);
  });

  it('refuses an effort the model does not take, against the default entry when no model is set — S-41', () => {
    expect(() => {
      validateDefaults(set({ model: 'haiku', effort: 'low' }), MODELS);
    }).toThrow(ClaudeConfigInputInvalidError);
    expect(() => {
      validateDefaults(set({ effort: 'medium' }), MODELS);
    }).toThrow(/effortUnsupported/);
    expect(() => {
      validateDefaults(set({ effort: 'high' }), MODELS);
    }).not.toThrow();
  });

  it('refuses a fallback equal to the main model — S-41', () => {
    expect(() => {
      validateDefaults(set({ model: 'sonnet', fallbackModel: 'sonnet' }), MODELS);
    }).toThrow(/fallbackSameAsModel/);
  });
});

describe('what a session opens with — plan 13, B-15', () => {
  const effectiveOf = (
    user: Partial<ClaudeDefaults>,
    folder?: Partial<ClaudeDefaults>,
  ): EffectiveDefaults =>
    effectiveDefaults({
      user: set(user),
      overrides: folder === undefined ? [] : [{ folder: '/srv/repo', values: set(folder) }],
      folder: '/srv/repo',
    });
  const offer = { models: MODELS, outputStyles: ['default', 'Concise'] };
  const nothing = { model: null, permissionMode: null, effort: null };

  it('lets the client’s model, mode and effort win over every default — S-48', () => {
    const applied = defaultsForSession(
      effectiveOf({ model: 'haiku', permissionMode: 'plan' }),
      offer,
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
    expect(defaultsForSession(effectiveOf({}), offer, nothing)).toEqual({
      ...NO_DEFAULTS,
      from: 'installation',
      stale: [],
    });
  });

  it('says whether the model came from the folder or from the user', () => {
    expect(
      defaultsForSession(effectiveOf({ model: 'haiku' }, { model: 'sonnet' }), offer, nothing).from,
    ).toBe('folder');
    expect(defaultsForSession(effectiveOf({ model: 'haiku' }), offer, nothing).from).toBe('user');
  });

  it('drops a model the installation no longer has, and says so — S-51', () => {
    const applied = defaultsForSession(
      effectiveOf({ model: 'retired', fallbackModel: 'haiku' }),
      offer,
      nothing,
    );

    expect(applied).toMatchObject({
      model: null,
      fallbackModel: 'haiku',
      from: 'installation',
      stale: ['model'],
    });
  });

  it('drops a style that is gone, an effort the model does not take, a fallback equal to the model — S-53', () => {
    const applied = defaultsForSession(
      effectiveOf({
        model: 'haiku',
        effort: 'high',
        outputStyle: 'Deleted',
        fallbackModel: 'haiku',
      }),
      offer,
      nothing,
    );

    expect(applied).toMatchObject({ outputStyle: null, effort: null, fallbackModel: null });
    expect(applied.stale).toEqual(['effort', 'outputStyle', 'fallbackModel']);
  });

  it('drops nothing while the installation is not known yet', () => {
    const applied = defaultsForSession(
      effectiveOf({ model: 'whatever', outputStyle: 'Mine', effort: 'max' }),
      { models: null, outputStyles: null },
      nothing,
    );

    expect(applied).toMatchObject({
      model: 'whatever',
      outputStyle: 'Mine',
      effort: 'max',
      stale: [],
    });
  });
});

describe('the login, read off the account — plan 13, S-25', () => {
  const account = {
    email: null,
    organization: null,
    plan: null,
    provider: 'firstParty',
    tokenSource: null,
    apiKeySource: null,
  };

  it('reads a first-party account with no e-mail and no key as nobody signed in', () => {
    expect(accountStateOf(account)).toBe('loginRequired');
    expect(accountStateOf({ ...account, provider: null, apiKeySource: 'none' })).toBe(
      'loginRequired',
    );
  });

  it('reads an e-mail, a key, a token or a cloud provider as signed in', () => {
    expect(accountStateOf({ ...account, email: 'p@example.com' })).toBe('ready');
    expect(accountStateOf({ ...account, apiKeySource: 'ANTHROPIC_API_KEY' })).toBe('ready');
    expect(accountStateOf({ ...account, tokenSource: 'claude.ai' })).toBe('ready');
    expect(accountStateOf({ ...account, provider: 'bedrock' })).toBe('ready');
  });
});
