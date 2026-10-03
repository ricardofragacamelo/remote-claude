import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { forgetLiveSessions } from '@/features/session';
import { useSessionHeader } from '@/features/session/hooks/useSessionHeader';
import { liveSessionStoreOf } from '@/features/session/store/live-session.store';
import { useOwnedSessionsStore } from '@/features/session/store/owned-sessions.store';
import type { Envelope } from '@remote-claude/contracts';
import { aLiveSocket, hubEvent } from '../../../../support/live-socket';
import type { LiveSocket } from '../../../../support/live-socket';

const SESSION = 's-1';

let live: LiveSocket;

beforeEach(() => {
  live = aLiveSocket();
  live.connect();
});

afterEach(() => {
  live.close();
  forgetLiveSessions();
  useOwnedSessionsStore.setState({ owned: [] });
});

/** What the stream says of the session, as the screen of the session lays it in the store. */
function streams(...frames: Record<string, unknown>[]): void {
  act(() => {
    for (const frame of frames) {
      liveSessionStoreOf(SESSION)
        .getState()
        .apply(frame as unknown as Envelope);
    }
  });
}

const closes = (): number =>
  live.sent().filter((frame) => frame['type'] === 'session.close').length;

describe('the session, as the header of the panel reads it — plan 09, B-17, B-18', () => {
  it('reads how it stands, what it cost and over how many turns, from the store of the stream', () => {
    const { result } = renderHook(() => useSessionHeader(SESSION));
    expect(result.current).toMatchObject({ status: 'starting', turns: 0, ended: false });

    streams(
      hubEvent(SESSION, 'session.statusChanged', 1, { status: 'running' }),
      hubEvent(SESSION, 'turn.completed', 2, { turnId: 't1', costUsd: '0.0100', durationMs: 5 }),
    );

    expect(result.current.turns).toBe(1);
    expect(Number(result.current.costUsd)).toBe(0.01);
    expect(result.current.connection).toBe('ready');
  });

  it('knows it ended, and whose it is', () => {
    useOwnedSessionsStore.getState().claim(SESSION);
    const { result } = renderHook(() => useSessionHeader(SESSION));

    streams(hubEvent(SESSION, 'session.closed', 1, { sessionId: SESSION, reason: 'completed' }));

    expect(result.current.isOwner).toBe(true);
    expect(result.current.ended).toBe(true);
  });

  it('ends the session once, however often it is asked — S-39', () => {
    const { result } = renderHook(() => useSessionHeader(SESSION));

    act(() => {
      result.current.close();
      result.current.close();
    });

    expect(closes()).toBe(1);
  });

  it('sends nothing while the socket is down', () => {
    live.close();
    const { result } = renderHook(() => useSessionHeader(SESSION));

    act(() => {
      result.current.close();
    });

    expect(live.lastSent('session.close')).toBeUndefined();
  });
});
