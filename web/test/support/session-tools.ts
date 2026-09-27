import { vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { api } from '@/shared/api/api';

/**
 * The slash commands and the undo points as the backend answers them, for the specs of the
 * session screen, its hooks and its services.
 *
 * One place, because the service, the hook and the screen describe the same payloads, and a copy
 * per spec is how two of them come to disagree about an optional field.
 */

export const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';
export const AT = '2026-09-26T12:00:00.000Z';

/** One command as `GET /sessions/:id/commands` describes it. */
export function aCommandDto(
  name: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name,
    description: `What /${name} does`,
    argumentHint: '',
    aliases: [],
    suggested: false,
    ...overrides,
  };
}

/** The menu of an installation: the suggested first, then the rest by name — as the backend orders it. */
export function aCommandMenu(
  commands: readonly Record<string, unknown>[] = [
    aCommandDto('init', { suggested: true, description: 'Initialise AGENTS.md' }),
    aCommandDto('review', { suggested: true, argumentHint: '<pr>' }),
    aCommandDto('compact', { aliases: ['squash'], description: 'Summarise the conversation' }),
    aCommandDto('cost'),
  ],
  cliVersion: string | null = '2.1.277',
): Record<string, unknown> {
  return { cliVersion, commands };
}

/** One undo point, with a file in each of the four outcomes. */
export function aCheckpointDto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    promptId: 'prompt-2',
    label: 'refactor the parser',
    at: AT,
    files: [
      { path: '/srv/app/a.ts', outcome: 'revert', action: 'restore' },
      { path: '/srv/app/new.ts', outcome: 'revert', action: 'delete' },
      { path: '/srv/app/b.ts', outcome: 'preserve', reason: 'modifiedOutside' },
      { path: '/srv/app/c.ts', outcome: 'unchanged' },
    ],
    ...overrides,
  };
}

/** What `session.rewound` carries. */
export function aRewoundPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    promptId: 'prompt-2',
    reverted: [
      { path: '/srv/app/a.ts', action: 'restored' },
      { path: '/srv/app/new.ts', action: 'deleted' },
    ],
    preserved: [{ path: '/srv/app/b.ts', reason: 'modifiedOutside' }],
    unchanged: [{ path: '/srv/app/c.ts' }],
    failed: [],
    ...overrides,
  };
}

/** An error envelope, as `api.ts` would have turned it into a rejection. */
export function aWireError(code: string, messageKey: string): Record<string, unknown> {
  return { code, messageKey, params: {}, traceId: `trace-${code}` };
}

/** An `error` frame refusing one command, as the gateway sends it. */
export function aRefusal(
  correlationId: string,
  code: string,
  messageKey: string,
  params: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    v: 1,
    id: `err-${correlationId}`,
    kind: 'error',
    type: 'error',
    ts: AT,
    correlationId,
    traceId: `trace-${code}`,
    payload: { code, messageKey, params },
  };
}

/** The session-wide error that follows an undo that stopped short. */
export function anIncompleteRewind(sessionId: string, failed: number): Record<string, unknown> {
  return {
    v: 1,
    id: 'err-incomplete',
    kind: 'error',
    type: 'error',
    ts: AT,
    sessionId,
    traceId: 'trace-incomplete',
    payload: {
      code: 'INTERNAL_ERROR',
      messageKey: 'session.error.rewindIncomplete',
      params: { failed },
    },
  };
}

/**
 * Answers `api.get` by path: each route a queue of answers, the last one repeated.
 *
 * An answer that is an `Error`-like record with a `code` is a rejection, the way `api.ts` rejects.
 * Anything not routed rejects too — a request nobody expected is a failure of the spec, and a real
 * `fetch` from a unit test is a request to whatever happens to listen on the port.
 */
export function routeApi(routes: Record<string, readonly unknown[]>): MockInstance<typeof api.get> {
  const served = new Map<string, number>();

  return vi.spyOn(api, 'get').mockImplementation((path: string) => {
    const answers = routes[path];

    if (answers === undefined || answers.length === 0) {
      return Promise.reject(new Error(`unexpected GET ${path}`));
    }

    const index = Math.min(served.get(path) ?? 0, answers.length - 1);
    served.set(path, index + 1);
    const answer = answers[index];

    return isWireError(answer) ? Promise.reject(answer) : Promise.resolve(answer);
  });
}

function isWireError(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'code' in value && 'messageKey' in value;
}
