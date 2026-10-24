import { vi } from 'vitest';

import { api } from '@/shared/api/api';
import { anEngineList } from './engines';

/** One skill of the folder, plain and enabled by default — plan 13, B-34. */
export function aSkill(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'review',
    origin: 'project',
    description: 'Reviews a PR',
    sourceFile: '.claude/skills/review/SKILL.md',
    enabled: true,
    unloadedReason: null,
    ...overrides,
  };
}

const EMPTY_PREFERENCES_VIEW = {
  effective: { value: { sources: {}, disabledSkills: [] }, from: 'installation' },
  user: null,
  folder: null,
};

/** `GET /engines`, with the `mcp` capability — what the specs of this screen start from. */
export const ENGINES = { '/engines': () => Promise.resolve(anEngineList()) };

/** The backend of the Skills settings screen: every read answered, the rest never (plan 13, B-34). */
export function skillBackendAnswers(overrides: Record<string, () => Promise<unknown>> = {}) {
  const answers: Record<string, () => Promise<unknown>> = {
    ...ENGINES,
    '/engines/claude/skills': () => Promise.resolve({ skills: [] }),
    '/engines/claude/skills/preferences': () => Promise.resolve(EMPTY_PREFERENCES_VIEW),
    '/workspaces/open-folders': () => Promise.resolve({ folders: [] }),
    '/workspaces/recent': () => Promise.resolve({ folders: [] }),
    ...overrides,
  };
  return vi.spyOn(api, 'get').mockImplementation((route: string) => {
    const answer = answers[route.split('?')[0] ?? route];
    return answer === undefined ? new Promise(() => undefined) : (answer() as Promise<never>);
  });
}
