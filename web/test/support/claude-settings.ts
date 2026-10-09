import { vi } from 'vitest';

import { api } from '@/shared/api/api';

/** The installation's models, as `GET /claude/models` answers them. */
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

/** Defaults with nothing set. */
export const NONE = {
  model: null,
  permissionMode: null,
  effort: null,
  thinking: null,
  outputStyle: null,
  fallbackModel: null,
};

/** Every field left to the installation. */
export const installationOnly = Object.fromEntries(
  ['model', 'permissionMode', 'effort', 'thinking', 'outputStyle', 'fallbackModel'].map((field) => [
    field,
    { value: null, from: 'installation' },
  ]),
);
export const DEFAULTS = { effective: installationOnly, user: NONE, folder: null };

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

/** The backend of the screen: every read answered, the rest never. */
export function backendAnswers(overrides: Record<string, () => Promise<unknown>> = {}) {
  const answers: Record<string, () => Promise<unknown>> = {
    '/claude/account': () => Promise.resolve(ACCOUNT),
    '/claude/installation': () => Promise.resolve(INSTALLATION),
    '/claude/models': () =>
      Promise.resolve({ cliVersion: '2.1.277', models: MODELS, permissionModes: [] }),
    '/claude/defaults': () => Promise.resolve(DEFAULTS),
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
