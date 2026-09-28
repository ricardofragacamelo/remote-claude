import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useSessionStream } from '@/features/session/hooks/useSessionStream';
import { useSessionStreamStore } from '@/features/session';
import { setAccessToken } from '@/shared/api/credentials';
import { wsClient } from '@/shared/api/ws';
import { installFakeWebSocket } from '../../../../support/fake-websocket';
import type { InstalledWebSocket } from '../../../../support/fake-websocket';

const readyFrame = {
  v: 1,
  id: 'srv-0',
  kind: 'ack',
  type: 'connection.ready',
  ts: '2026-09-13T12:00:00.000Z',
  payload: { connectionId: 'c1', serverVersion: '1', limits: {} },
};

/**
 * What the round-trip screen cannot show, because its button is disabled while the socket is
 * down: a ping asked for anyway, which the transport refuses.
 */
describe('the session stream hook', () => {
  let sockets: InstalledWebSocket;

  beforeEach(() => {
    useSessionStreamStore.getState().reset();
    setAccessToken('token-1');
    sockets = installFakeWebSocket();
  });

  afterEach(() => {
    wsClient.close();
    setAccessToken(null);
  });

  it('waits for the answer of a ping that left', () => {
    const { result } = renderHook(() => useSessionStream());
    act(() => {
      wsClient.connect();
      sockets.latest.open();
      sockets.latest.receive(readyFrame);
    });

    act(() => {
      result.current.ping();
    });

    expect(result.current.isSending).toBe(true);
    expect(sockets.latest.frames().filter((sent) => sent['type'] === 'diag.ping')).toHaveLength(1);
  });

  it('does not wait for a ping the socket refused', () => {
    // No connection at all: the command never leaves, and a wait for its answer would leave the
    // screen looking busy for something that is not coming.
    const { result } = renderHook(() => useSessionStream());

    act(() => {
      result.current.ping();
    });

    expect(result.current.isSending).toBe(false);
    expect(sockets.created).toHaveLength(0);
  });
});
