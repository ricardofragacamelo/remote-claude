import { vi } from 'vitest';

import { api } from '@/shared/api/api';
import { anEngineList } from './engines';

/** The installation's models, as `GET /engines/claude/models` answers them. */
export const MODELS = [
  {
    value: 'sonnet',
    resolvedModel: 'claude-sonnet-5',
    displayName: 'Sonnet',
    description: 'fast',
    supportsEffort: true,
    supportedEffortLevels: ['low', 'high'],
  },
  {
    value: 'haiku',
    resolvedModel: null,
    displayName: 'Haiku',
    description: 'cheap',
    supportsEffort: false,
    supportedEffortLevels: [],
  },
];

/** The core's five fields, with nothing set. */
export const NONE = {
  model: null,
  permissionMode: null,
  effort: null,
  thinking: null,
  fallbackModel: null,
};

/** Every field left to the installation. */
export const installationOnly = Object.fromEntries(
  ['model', 'permissionMode', 'effort', 'thinking', 'fallbackModel'].map((field) => [
    field,
    { value: null, from: 'installation' },
  ]),
);
export const DEFAULTS = { effective: installationOnly, user: NONE, folder: null };

/** The output style — the one field Claude's extension adds beside the core's (plan 28, D-06). */
export const OUTPUT_STYLE = {
  effective: { value: null, from: 'installation' },
  user: null,
  folder: null,
};

export const ACCOUNT = {
  state: 'ready',
  email: 'person@example.com',
  organization: null,
  plan: 'max',
  provider: 'firstParty',
  tokenSource: null,
  apiKeySource: null,
};
export const INSTALLATION = {
  agentSdk: { version: '0.3.277', reason: null },
  bundledCli: { version: '2.1.277', reason: null },
  pathCli: { version: '2.1.226', reason: null, differs: true },
  configDir: { path: '/home/me/.claude', fromEnvironment: false },
  login: 'ready',
  lastModelCheck: null,
};

/**
 * `GET /engines`, answered: what the form of the defaults offers — the modes and the levels of
 * effort the engine announces (plan 28, B-27, B-28). Left out of {@link backendAnswers}, so the
 * name of the agent of a text stays the one a spec computes before the list is read.
 */
export const ENGINES = { '/engines': () => Promise.resolve(anEngineList()) };

/** The backend of the screen: every read answered, the rest never. */
export function backendAnswers(overrides: Record<string, () => Promise<unknown>> = {}) {
  const answers: Record<string, () => Promise<unknown>> = {
    '/engines/claude/account': () => Promise.resolve(ACCOUNT),
    '/engines/claude/installation': () => Promise.resolve(INSTALLATION),
    '/engines/claude/models': () => Promise.resolve({ models: MODELS }),
    '/engines/claude/defaults': () => Promise.resolve(DEFAULTS),
    '/engines/claude/output-style': () => Promise.resolve(OUTPUT_STYLE),
    '/workspaces/open-folders': () =>
      Promise.resolve({ folders: [{ path: '/srv/app', rootLabel: 'srv', state: 'available' }] }),
    '/workspaces/recent': () => Promise.resolve({ folders: [] }),
    ...overrides,
  };
  return vi.spyOn(api, 'get').mockImplementation((route: string) => {
    const answer = answers[route.split('?')[0] ?? route];
    return answer === undefined ? new Promise(() => undefined) : (answer() as Promise<never>);
  });
}
