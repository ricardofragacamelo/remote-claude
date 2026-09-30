import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useConnection } from '@/features/diagnostics/hooks/useConnection';
import { setAccessToken } from '@/shared/api/credentials';
import { wsClient } from '@/shared/api/ws';
import { CLOSE_RATE_LIMITED } from '@/shared/api/ws-client';
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

describe('the connection, as Logs and diagnostics shows it — plan 06, S-200', () => {
  let sockets: InstalledWebSocket;

  beforeEach(() => {
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

  it('offers nothing to reconnect while the socket is up', () => {
    const { result } = renderHook(() => useConnection());
    connect();

    expect(result.current).toMatchObject({ status: 'ready', canReconnect: false, heldBack: false });
  });

  it('offers to reconnect once the socket dropped, and tries at once', () => {
    const { result } = renderHook(() => useConnection());
    connect();
    act(() => {
      sockets.latest.close(4000);
    });

    expect(result.current).toMatchObject({ status: 'reconnecting', canReconnect: true });

    act(() => {
      result.current.reconnect();
    });

    expect(sockets.created).toHaveLength(2);
  });

  it('holds the button back while the server asked to slow down', () => {
    const { result } = renderHook(() => useConnection());
    connect();
    act(() => {
      sockets.latest.close(CLOSE_RATE_LIMITED);
    });

    expect(result.current).toMatchObject({
      status: 'throttled',
      canReconnect: false,
      heldBack: true,
    });
  });
});
