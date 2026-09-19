import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Envelope } from '@remote-claude/contracts';

import { setAccessToken } from '@/shared/api/credentials';
import { wsClient } from '@/shared/api/ws';
import { useSessionFrames } from '@/shared/hooks/useSessionFrames';
import { installFakeWebSocket } from '../../../support/fake-websocket';
import type { InstalledWebSocket } from '../../../support/fake-websocket';

const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';
const AT = '2026-09-19T12:00:00.000Z';

const readyFrame = {
  v: 1,
  id: 'srv-0',
  kind: 'ack',
  type: 'connection.ready',
  ts: AT,
  payload: { connectionId: 'c1', serverVersion: '1', limits: {} },
};

/** The subscription three features share, and the detach that is the reason it is shared. */
describe('watching a session', () => {
  let sockets: InstalledWebSocket;
  let applied: Envelope[];
  let resets: number;

  beforeEach(() => {
    applied = [];
    resets = 0;
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

  const handlers = (lastSeq = 0) => ({
    apply: (frame: Envelope) => applied.push(frame),
    reset: () => {
      resets += 1;
    },
    lastSeq: () => lastSeq,
  });

  it('subscribes to nothing when there is no session yet', () => {
    // The screen renders before the route has named a session; attaching to `null` would be a
    // `session.attach` for an id that does not exist.
    renderHook(() => {
      useSessionFrames(null, handlers());
    });
    connect();

    expect(sockets.latest.frames().some((frame) => frame['type'] === 'session.attach')).toBe(false);
  });

  it('attaches, and hands every frame of that session over', () => {
    renderHook(() => {
      useSessionFrames(SESSION, handlers());
    });
    connect();

    act(() => {
      sockets.latest.receive({
        v: 1,
        id: 'evt-1',
        kind: 'event',
        type: 'message.delta',
        ts: AT,
        sessionId: SESSION,
        seq: 1,
        payload: { messageId: 'm1', delta: 'x' },
      });
    });

    expect(applied.map((frame) => frame.type)).toEqual(['message.delta']);
  });

  it('resumes from where the feature left off', () => {
    renderHook(() => {
      useSessionFrames(SESSION, handlers(7));
    });
    connect();

    expect(
      sockets.latest.frames().find((frame) => frame['type'] === 'session.attach'),
    ).toMatchObject({ payload: { sessionId: SESSION, resumeFromSeq: 7 } });
  });

  it('asks the feature to start again when the replay has a gap', () => {
    renderHook(() => {
      useSessionFrames(SESSION, handlers());
    });
    connect();

    act(() => {
      sockets.latest.receive({
        v: 1,
        id: 'ack-1',
        kind: 'ack',
        type: 'session.attached',
        ts: AT,
        payload: { sessionId: SESSION, replayed: 0, oldestAvailableSeq: 900, gap: true },
      });
    });

    expect(resets).toBe(1);
  });

  it('detaches when the screen goes, and tells the server', () => {
    const { unmount } = renderHook(() => {
      useSessionFrames(SESSION, handlers());
    });
    connect();

    unmount();

    expect(sockets.latest.frames().some((frame) => frame['type'] === 'session.detach')).toBe(true);
  });

  it('uses the handlers it was last given, without re-attaching for them', () => {
    // A bag of callbacks is rebuilt on every render. Re-attaching for that would be a
    // `session.attach` on the wire per render, asking for a replay nobody needs.
    let seen = 'first';
    const { rerender } = renderHook(
      ({ tag }: { tag: string }) => {
        useSessionFrames(SESSION, {
          apply: () => {
            seen = tag;
          },
          reset: () => undefined,
          lastSeq: () => 0,
        });
      },
      { initialProps: { tag: 'first' } },
    );
    connect();

    rerender({ tag: 'second' });

    act(() => {
      sockets.latest.receive({
        v: 1,
        id: 'evt-1',
        kind: 'event',
        type: 'message.delta',
        ts: AT,
        sessionId: SESSION,
        seq: 1,
        payload: { messageId: 'm1', delta: 'x' },
      });
    });

    expect(seen).toBe('second');
    expect(
      sockets.latest.frames().filter((frame) => frame['type'] === 'session.attach'),
    ).toHaveLength(1);
  });
});
