import { vi } from 'vitest';

import { api } from '@/shared/api/api';
import { anEngineList } from './engines';

/** One plugin of the store, local, enabled, current — plan 13, B-29. */
export function aPlugin(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'plugin-1',
    origin: 'local',
    path: '/srv/app/.claude/plugins/my-plugin',
    marketplace: null,
    commit: null,
    name: 'my-plugin',
    state: 'current',
    enabled: true,
    manifest: {
      name: 'my-plugin',
      description: 'A plugin',
      version: '1.0.0',
      commands: ['hello'],
      agents: [],
      hookCount: 0,
      skills: [],
      mcpServerNames: [],
    },
    createdAt: '2026-10-19T12:00:00.000Z',
    updatedAt: '2026-10-19T12:00:00.000Z',
    ...overrides,
  };
}

/** One entry of a marketplace's own catalogue — plan 13, B-47, B-29. */
export function aCatalogEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'linter-pack',
    description: 'Lints the repository on every commit.',
    supported: true,
    ...overrides,
  };
}

/** `GET /engines`, with the `mcp` capability — what the specs of this screen start from. */
export const ENGINES = { '/engines': () => Promise.resolve(anEngineList()) };

/** The backend of the plugins settings screen: every read answered, the rest never (plan 13, B-29). */
export function pluginBackendAnswers(overrides: Record<string, () => Promise<unknown>> = {}) {
  const answers: Record<string, () => Promise<unknown>> = {
    ...ENGINES,
    '/engines/claude/plugins': () => Promise.resolve({ plugins: [] }),
    '/engines/claude/plugins/marketplaces': () => Promise.resolve({ marketplaces: [] }),
    ...overrides,
  };
  return vi.spyOn(api, 'get').mockImplementation((route: string) => {
    const answer = answers[route.split('?')[0] ?? route];
    return answer === undefined ? new Promise(() => undefined) : (answer() as Promise<never>);
  });
}
