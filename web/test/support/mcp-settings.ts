import { vi } from 'vitest';

import { api } from '@/shared/api/api';
import { anEngineList } from './engines';

/** One stdio server of the store, enabled, pending (no live session shows it) — plan 13, B-28. */
export function aServer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'server-1',
    name: 'github',
    scope: 'user',
    folderPath: null,
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'server-github'],
    envNames: ['GITHUB_TOKEN'],
    url: null,
    headerNames: [],
    enabled: true,
    status: 'pending',
    createdAt: '2026-10-19T12:00:00.000Z',
    updatedAt: '2026-10-19T12:00:00.000Z',
    ...overrides,
  };
}

/** One entry of a project's own MCP file, pending — plan 13, B-24, B-28. */
export function aProjectServer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    folderPath: '/srv/app',
    name: 'docs',
    state: 'pending',
    digest: 'd1',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'server'],
    url: null,
    env: [],
    headers: [],
    approvedSnapshot: null,
    ...overrides,
  };
}

/** `GET /engines`, with the `mcp` capability — what the specs of this screen start from. */
export const ENGINES = { '/engines': () => Promise.resolve(anEngineList()) };

/** The backend of the MCP settings screen: every read answered, the rest never (plan 13, B-28). */
export function mcpBackendAnswers(overrides: Record<string, () => Promise<unknown>> = {}) {
  const answers: Record<string, () => Promise<unknown>> = {
    ...ENGINES,
    '/engines/claude/mcp-servers': () => Promise.resolve({ servers: [] }),
    '/engines/claude/project-mcp-approvals': () => Promise.resolve({ servers: [], errors: [] }),
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
