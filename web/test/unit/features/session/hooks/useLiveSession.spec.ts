import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useLiveSession } from '@/features/session/hooks/useLiveSession';
import { useLiveSessionStore } from '@/features/session';
import { setAccessToken } from '@/shared/api/credentials';
import { wsClient } from '@/shared/api/ws';
import { installFakeWebSocket } from '../../../../support/fake-websocket';
import type { InstalledWebSocket } from '../../../../support/fake-websocket';

const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';

const readyFrame = {
  v: 1,
  id: 'srv-0',
  kind: 'ack',
  type: 'connection.ready',
  ts: '2026-09-19T12:00:00.000Z',
  payload: { connectionId: 'c1', serverVersion: '1', limits: {} },
};

/**
 * The controls of a session, at the level where they are all reachable.
 *
 * Two of them — the model and the permission mode — have no button yet, because the screen that
 * would carry them belongs to a later plan. They exist on the hook because the contract carries
 * them, and a command nobody exercises is a command that stops working in silence.
 */
describe('driving a session', () => {
  let sockets: InstalledWebSocket;

  beforeEach(() => {
    useLiveSessionStore.getState().reset();
    setAccessToken('token-1');
    sockets = installFakeWebSocket();
  });

  afterEach(() => {
    wsClient.close();
    setAccessToken(null);
  });

  function connect(): void {
    act(() => {
      wsClient.connect();
      sockets.latest.open();
      sockets.latest.receive(readyFrame);
    });
  }

  function sentTypes(): string[] {
    return sockets.latest.frames().map((frame) => String(frame['type']));
  }

  it('sends every control of a session it is watching', () => {
    const { result } = renderHook(() => useLiveSession(SESSION));
    connect();

    act(() => {
      result.current.setModel('claude-opus-5');
      result.current.setPermissionMode('acceptEdits');
      result.current.close();
    });

    expect(sentTypes()).toEqual(
      expect.arrayContaining(['session.setModel', 'session.setPermissionMode', 'session.close']),
    );
  });

  it('opens a session on a workspace', () => {
    const { result } = renderHook(() => useLiveSession(null));
    connect();

    act(() => {
      result.current.start('/srv/projects/app');
    });

    expect(
      sockets.latest.frames().find((frame) => frame['type'] === 'session.start'),
    ).toMatchObject({ payload: { workspacePath: '/srv/projects/app' } });
  });

  it('starts the conversation again when the replay has a gap', () => {
    // The server no longer holds what this client missed. Stitching a partial hole would produce
    // a view that looks whole and is not, which is worse than one that admits it has to reload.
    const { result } = renderHook(() => useLiveSession(SESSION));
    connect();

    act(() => {
      sockets.latest.receive({
        v: 1,
        id: 'evt-1',
        kind: 'event',
        type: 'message.delta',
        ts: '2026-09-19T12:00:00.000Z',
        sessionId: SESSION,
        seq: 1,
        payload: { messageId: 'm1', delta: 'before the gap' },
      });
    });
    expect(result.current.messages).toHaveLength(1);

    act(() => {
      sockets.latest.receive({
        v: 1,
        id: 'ack-1',
        kind: 'ack',
        type: 'session.attached',
        ts: '2026-09-19T12:00:00.000Z',
        payload: { sessionId: SESSION, replayed: 0, oldestAvailableSeq: 900, gap: true },
      });
    });

    expect(result.current.messages).toEqual([]);
  });

  it('sends nothing for a session it does not have', () => {
    // The screen renders before the route has named a session, and a command about no session is
    // a command the backend would refuse with an id it never had.
    const { result } = renderHook(() => useLiveSession(null));
    connect();

    act(() => {
      result.current.prompt('hello');
      result.current.interrupt();
      result.current.setModel('claude-opus-5');
      result.current.setPermissionMode('plan');
      result.current.close();
    });

    expect(sentTypes()).not.toContain('session.prompt');
    expect(sentTypes()).not.toContain('session.close');
  });
});
