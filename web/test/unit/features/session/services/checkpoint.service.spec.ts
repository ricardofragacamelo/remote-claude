import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import {
  fetchCheckpoints,
  incompleteRewindOf,
  rewindFiles,
  rewoundOf,
} from '@/features/session/services/checkpoint.service';
import { api } from '@/shared/api/api';
import type { WsClient } from '@/shared/api/ws-client';
import {
  aCheckpointDto,
  anIncompleteRewind,
  aRewoundPayload,
  aWireError,
  AT,
  SESSION,
} from '../../../../support/session-tools';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchCheckpoints — plan 04, B-19', () => {
  it('asks the live session for its undo points', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ checkpoints: [] });

    await fetchCheckpoints('a b');

    expect(get).toHaveBeenCalledWith('/sessions/a%20b/checkpoints');
  });

  it('groups every file by what undoing would do to it now — S-38', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ checkpoints: [aCheckpointDto()] });

    expect(await fetchCheckpoints(SESSION)).toEqual([
      {
        promptId: 'prompt-2',
        label: 'refactor the parser',
        at: AT,
        restore: ['/srv/app/a.ts'],
        remove: ['/srv/app/new.ts'],
        preserve: [{ path: '/srv/app/b.ts', reason: 'modifiedOutside' }],
        unchanged: ['/srv/app/c.ts'],
      },
    ]);
  });

  it('keeps the order the backend gave — newest first', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      checkpoints: [aCheckpointDto({ promptId: 'p2' }), aCheckpointDto({ promptId: 'p1' })],
    });

    const points = await fetchCheckpoints(SESSION);

    expect(points.map((point) => point.promptId)).toEqual(['p2', 'p1']);
  });

  it('reads a turn without a prompt as an unlabelled point', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      checkpoints: [aCheckpointDto({ label: null, files: [] })],
    });

    expect(await fetchCheckpoints(SESSION)).toEqual([
      expect.objectContaining({
        label: null,
        restore: [],
        remove: [],
        preserve: [],
        unchanged: [],
      }),
    ]);
  });

  it.each(['modifiedOutside', 'notRestorable', 'unsafePath', 'noBaseline'])(
    'carries the reason %s a file stays',
    async (reason) => {
      vi.spyOn(api, 'get').mockResolvedValue({
        checkpoints: [aCheckpointDto({ files: [{ path: '/x', outcome: 'preserve', reason }] })],
      });

      const [point] = await fetchCheckpoints(SESSION);

      expect(point?.preserve).toEqual([{ path: '/x', reason }]);
    },
  );

  it('drops what it cannot read — a point it cannot aim at, a file it cannot promise', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      checkpoints: [
        'nope',
        aCheckpointDto({ promptId: '' }),
        aCheckpointDto({ at: null }),
        aCheckpointDto({
          promptId: 'kept',
          files: [
            'a.ts',
            { outcome: 'revert', action: 'restore' },
            { path: '/r', outcome: 'revert', action: 'rename' },
            { path: '/p', outcome: 'preserve', reason: 'mystery' },
            { path: '/q', outcome: 'preserve' },
            { path: '/u', outcome: 'gone' },
          ],
        }),
        aCheckpointDto({ promptId: 'no-files', files: 'none' }),
      ],
    });

    const points = await fetchCheckpoints(SESSION);

    expect(points.map((point) => point.promptId)).toEqual(['kept', 'no-files']);
    expect(points[0]).toMatchObject({ restore: [], remove: [], preserve: [], unchanged: [] });
  });

  it('reads a body without a list as no points at all', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ checkpoints: {} });

    expect(await fetchCheckpoints(SESSION)).toEqual([]);
  });

  it('lets a refusal reach the caller as it came', async () => {
    const failure = aWireError('SESSION_NOT_FOUND', 'session.error.notFound');
    vi.spyOn(api, 'get').mockRejectedValue(failure);

    await expect(fetchCheckpoints(SESSION)).rejects.toBe(failure);
  });
});

describe('rewindFiles — plan 04, B-18', () => {
  it('sends the point to go back to, and answers the id its refusal would name', () => {
    const issue = vi.fn().mockReturnValue('cmd-7');

    expect(rewindFiles({ issue } as unknown as WsClient, SESSION, 'prompt-2')).toBe('cmd-7');
    expect(issue).toHaveBeenCalledWith('session.rewindFiles', {
      sessionId: SESSION,
      promptId: 'prompt-2',
    });
  });

  it('answers null when nothing left', () => {
    const issue = vi.fn().mockReturnValue(null);

    expect(rewindFiles({ issue } as unknown as WsClient, SESSION, 'prompt-2')).toBeNull();
  });
});

describe('reading what an undo did', () => {
  const event = (
    payload: Record<string, unknown> | undefined,
    type = 'session.rewound',
  ): Envelope => ({
    v: 1,
    id: 'evt-1',
    kind: 'event',
    type,
    ts: AT,
    sessionId: SESSION,
    seq: 4,
    ...(payload === undefined ? {} : { payload }),
  });

  it('is the outcome, file by file — S-37, S-63', () => {
    expect(rewoundOf(event(aRewoundPayload()))).toEqual({
      promptId: 'prompt-2',
      restored: ['/srv/app/a.ts'],
      deleted: ['/srv/app/new.ts'],
      preserved: [{ path: '/srv/app/b.ts', reason: 'modifiedOutside' }],
      unchanged: ['/srv/app/c.ts'],
      failed: [],
    });
  });

  it('carries what could not be put back — S-44, S-62', () => {
    const outcome = rewoundOf(event(aRewoundPayload({ failed: [{ path: '/srv/app/a.ts' }] })));

    expect(outcome?.failed).toEqual(['/srv/app/a.ts']);
  });

  it('reads missing lists as empty ones', () => {
    expect(rewoundOf(event({ promptId: 'p', reverted: 'x' }))).toEqual({
      promptId: 'p',
      restored: [],
      deleted: [],
      preserved: [],
      unchanged: [],
      failed: [],
    });
  });

  it.each([
    ['another event', event(aRewoundPayload(), 'turn.completed')],
    ['an outcome with no payload', event(undefined)],
    ['an outcome that names no point', event(aRewoundPayload({ promptId: '' }))],
  ])('is nothing for %s', (_case, frame) => {
    expect(rewoundOf(frame)).toBeNull();
  });
});

describe('recognising an undo that stopped short', () => {
  const frame = (overrides: Partial<Envelope> = {}): Envelope => ({
    ...(anIncompleteRewind(SESSION, 2) as unknown as Envelope),
    ...overrides,
  });

  it('is the session-wide error with its count — S-44', () => {
    expect(incompleteRewindOf(frame(), SESSION)).toMatchObject({
      code: 'INTERNAL_ERROR',
      messageKey: 'session.error.rewindIncomplete',
      params: { failed: 2 },
      traceId: 'trace-incomplete',
    });
  });

  it('falls back to the frame id for a trace it does not carry', () => {
    const untraced = { ...frame(), traceId: undefined } as unknown as Envelope;

    expect(incompleteRewindOf(untraced, SESSION)?.traceId).toBe('err-incomplete');
  });

  it.each([
    ['of another session', frame(), 'another-session'],
    ['that refuses one command', frame({ correlationId: 'cmd-1' }), SESSION],
    ['that is not an error', frame({ kind: 'event' }), SESSION],
    ['with no payload', { ...frame(), payload: undefined } as unknown as Envelope, SESSION],
    [
      'about something else',
      frame({ payload: { code: 'INTERNAL_ERROR', messageKey: 'common.error.unexpected' } }),
      SESSION,
    ],
  ])('is nothing for an error %s', (_case, candidate, sessionId) => {
    expect(incompleteRewindOf(candidate, sessionId)).toBeNull();
  });
});
