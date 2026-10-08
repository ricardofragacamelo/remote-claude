import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { forgetPermissionQueues, permissionQueueOf } from '@/features/permission';
import { usePermissionQueue } from '@/features/permission/hooks/usePermissionQueue';
import { setAccessToken } from '@/shared/api/credentials';
import { wsClient } from '@/shared/api/ws';
import { installFakeWebSocket } from '../../../../support/fake-websocket';
import type { InstalledWebSocket } from '../../../../support/fake-websocket';

const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';
const NOW = '2026-09-19T12:00:00.000Z';

const readyFrame = {
  v: 1,
  id: 'srv-0',
  kind: 'ack',
  type: 'connection.ready',
  ts: NOW,
  payload: { connectionId: 'c1', serverVersion: '1', limits: {} },
};

/** The question, as the server asks it. Far from its deadline, so no countdown interferes. */
const requestFrame = {
  v: 1,
  id: 'frame-1',
  kind: 'request',
  type: 'permission.requested',
  ts: NOW,
  sessionId: SESSION,
  payload: {
    requestId: 'req-1',
    toolUseId: 'toolu-1',
    toolName: 'Bash',
    title: 'permission.tool.Bash',
    description: 'rm -rf build/',
    input: { command: 'rm -rf build/' },
    riskHint: 'destructive',
    defaultToNo: true,
    expiresAt: '2999-01-01T00:00:00.000Z',
    suggestions: [{ scope: 'once', labelKey: 'permission.scope.once' }],
  },
};

/**
 * What the queue's screen cannot be made to do, because its buttons are disabled first: an answer
 * asked for twice, and an answer asked for while the socket is down.
 */
describe('the permission queue hook', () => {
  let sockets: InstalledWebSocket;

  beforeEach(() => {
    forgetPermissionQueues();
    setAccessToken('token-1');
    sockets = installFakeWebSocket();
  });

  afterEach(() => {
    wsClient.close();
    setAccessToken(null);
  });

  /** The hook, on a ready connection, with one question on screen. */
  function mountWithQuestion() {
    const mounted = renderHook(() => usePermissionQueue(SESSION));
    act(() => {
      wsClient.connect();
      sockets.latest.open();
      sockets.latest.receive(readyFrame);
      sockets.latest.receive(requestFrame);
    });
    return mounted;
  }

  function answers(): readonly Record<string, unknown>[] {
    return sockets.latest.frames().filter((sent) => sent['type'] === 'permission.resolve');
  }

  it('sends one answer for a card that is already answering — S-70', () => {
    const { result } = mountWithQuestion();

    act(() => {
      const [request] = result.current.pending;
      if (request !== undefined) {
        result.current.answer(request, 'allow', 'once');
      }
    });

    // The card as the screen now holds it: answering. A second answer for it is a second answer.
    const answering = result.current.pending[0];
    expect(answering?.isAnswering).toBe(true);

    act(() => {
      if (answering !== undefined) {
        result.current.answer(answering, 'deny', 'once');
      }
    });

    expect(answers()).toHaveLength(1);
    expect(answers()[0]).toMatchObject({ payload: { requestId: 'req-1', decision: 'allow' } });
    expect(result.current.pending[0]?.isAnswering).toBe(true);
  });

  it('gives the card back when the socket was down and nothing was sent', () => {
    const { result } = mountWithQuestion();

    // The socket goes away while the card is on screen; the queue keeps what it was asked.
    act(() => {
      wsClient.close();
    });
    expect(result.current.pending).toHaveLength(1);

    const seen: boolean[] = [];
    const unsubscribe = permissionQueueOf(SESSION).subscribe((state) => {
      seen.push(state.pending[0]?.isAnswering ?? false);
    });

    act(() => {
      const [request] = result.current.pending;
      if (request !== undefined) {
        result.current.answer(request, 'allow', 'once');
      }
    });
    unsubscribe();

    // Disabled for the attempt, and enabled again the moment the attempt turned out not to leave.
    expect(seen).toEqual([true, false]);
    expect(result.current.pending[0]?.isAnswering).toBe(false);
    expect(answers()).toHaveLength(0);
  });

  it('says why an answer was refused — it came after the deadline — and gives the card back — plan 09, S-61', () => {
    const { result } = mountWithQuestion();

    act(() => {
      const [request] = result.current.pending;
      if (request !== undefined) result.current.answer(request, 'allow', 'once');
    });
    const answerId = answers()[0]?.['id'];

    act(() => {
      sockets.latest.receive({
        v: 1,
        id: 'err-1',
        kind: 'error',
        type: 'error',
        ts: NOW,
        correlationId: 'not-ours',
        payload: { code: 'INTERNAL_ERROR', messageKey: 'common.error.unexpected', params: {} },
      });
    });
    expect(result.current.refusal).toBeNull();

    act(() => {
      sockets.latest.receive({
        v: 1,
        id: 'err-2',
        kind: 'error',
        type: 'error',
        ts: NOW,
        correlationId: answerId,
        traceId: 'trace-late',
        payload: {
          code: 'PERMISSION_REQUEST_EXPIRED',
          messageKey: 'permission.error.requestExpired',
          params: {},
        },
      });
    });

    expect(result.current.refusal?.code).toBe('PERMISSION_REQUEST_EXPIRED');
    expect(result.current.pending[0]?.isAnswering).toBe(false);
  });

  it('forgets the last refusal when the next answer leaves', () => {
    const { result } = mountWithQuestion();

    act(() => {
      const [request] = result.current.pending;
      if (request !== undefined) result.current.answer(request, 'allow', 'once');
    });
    act(() => {
      sockets.latest.receive({
        v: 1,
        id: 'err-2',
        kind: 'error',
        type: 'error',
        ts: NOW,
        correlationId: answers()[0]?.['id'],
        payload: {
          code: 'PERMISSION_REQUEST_NOT_FOUND',
          messageKey: 'permission.error.requestNotFound',
        },
      });
    });
    expect(result.current.refusal).not.toBeNull();

    act(() => {
      const [request] = result.current.pending;
      if (request !== undefined) result.current.answer(request, 'deny', 'once');
    });

    expect(result.current.refusal).toBeNull();
  });
});

/** A question of Claude, as the server asks it. */
const questionFrame = {
  ...requestFrame,
  id: 'frame-q',
  payload: {
    ...requestFrame.payload,
    requestId: 'req-q',
    toolName: 'AskUserQuestion',
    title: 'permission.tool.AskUserQuestion',
    defaultToNo: false,
    suggestions: [],
    interaction: {
      kind: 'question',
      malformed: false,
      questions: [
        {
          id: 'q1',
          header: 'Library',
          prompt: 'Which library?',
          multiSelect: false,
          options: [
            { label: 'date-fns', description: '' },
            { label: 'luxon', description: '' },
          ],
        },
      ],
    },
  },
};

describe('answering a question of Claude — plan 24, B-13', () => {
  let sockets: InstalledWebSocket;

  beforeEach(() => {
    forgetPermissionQueues();
    setAccessToken('token-1');
    sockets = installFakeWebSocket();
  });

  afterEach(() => {
    wsClient.close();
    setAccessToken(null);
  });

  function mountWithQuestion() {
    const mounted = renderHook(() => usePermissionQueue(SESSION));
    act(() => {
      wsClient.connect();
      sockets.latest.open();
      sockets.latest.receive(readyFrame);
      sockets.latest.receive(questionFrame);
    });
    return mounted;
  }

  const resolves = (): readonly Record<string, unknown>[] =>
    sockets.latest.frames().filter((sent) => sent['type'] === 'permission.resolve');

  it('allows once, with the answers, and nothing to persist — S-61', () => {
    const { result } = mountWithQuestion();
    const [request] = result.current.pending;

    act(() => {
      result.current.answerQuestion(request!, [
        { questionId: 'q1', selected: ['luxon'], other: null },
      ]);
    });

    expect(resolves()[0]?.['payload']).toEqual({
      requestId: 'req-q',
      decision: 'allow',
      scope: 'once',
      answers: [{ questionId: 'q1', selected: ['luxon'] }],
    });
  });

  it('refuses with what was written, or with our sentence for nothing — S-72', () => {
    const { result } = mountWithQuestion();
    const [request] = result.current.pending;

    act(() => {
      result.current.declineQuestion(request!, '  ');
    });

    expect(resolves()[0]?.['payload']).toEqual({
      requestId: 'req-q',
      decision: 'deny',
      scope: 'once',
      reason: 'The user chose not to answer the question.',
    });
  });

  it('keeps the draft it is given, by request — S-62', () => {
    const { result } = mountWithQuestion();
    const draft = { step: 0, selected: { q1: ['luxon'] }, other: {} };

    act(() => {
      result.current.saveDraft('req-q', draft);
    });

    expect(result.current.drafts).toEqual({ 'req-q': draft });
    expect(permissionQueueOf(SESSION).getState().drafts['req-q']).toEqual(draft);
  });
});
