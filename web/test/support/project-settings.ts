import { vi } from 'vitest';

import { api } from '@/shared/api/api';
import { anEngineList } from './engines';

/** An empty, folder-shaped `ProjectConfigView` — every list present, nothing in any of them. */
export function aProjectConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    folderPath: '/srv/app',
    memory: [],
    commands: [],
    agents: [],
    outputStyles: [],
    hooks: [],
    permissions: [],
    plugins: { enabled: [], disabled: [], enableAllProjectMcpServers: false },
    issues: [],
    ...overrides,
  };
}

/** `GET /engines`, with the `mcp` capability — what every spec of this screen starts from. */
export const ENGINES = { '/engines': () => Promise.resolve(anEngineList()) };

/** The backend of the Project settings screen: every read answered, the rest never (plan 13, B-39). */
export function projectBackendAnswers(overrides: Record<string, () => Promise<unknown>> = {}) {
  const answers: Record<string, () => Promise<unknown>> = {
    ...ENGINES,
    '/engines/claude/project-config': () => Promise.resolve(aProjectConfig()),
    '/workspaces/open-folders': () => Promise.resolve({ folders: [] }),
    '/workspaces/recent': () => Promise.resolve({ folders: [] }),
    ...overrides,
  };
  return vi.spyOn(api, 'get').mockImplementation((route: string) => {
    const answer = answers[route.split('?')[0] ?? route];
    return answer === undefined ? new Promise(() => undefined) : (answer() as Promise<never>);
  });
}
