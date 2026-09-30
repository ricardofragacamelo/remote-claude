import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { usePing } from '@/features/diagnostics/hooks/usePing';
import { usePingStore } from '@/features/diagnostics';
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

describe('the round trip hook', () => {
  let sockets: InstalledWebSocket;

  beforeEach(() => {
    usePingStore.getState().reset();
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

  function pings(): number {
    return sockets.latest.frames().filter((sent) => sent['type'] === 'diag.ping').length;
  }

  it('waits for the answer of a ping that left', () => {
    const { result } = renderHook(() => usePing());
    connect();

    act(() => {
      result.current.ping();
    });

    expect(result.current.isSending).toBe(true);
    expect(result.current.requests).toHaveLength(1);
    expect(pings()).toBe(1);
  });

  it('sends one ping while one is on its way, however many times it is asked — 00·S-110', () => {
    const { result } = renderHook(() => usePing());
    connect();

    act(() => {
      result.current.ping();
      result.current.ping();
    });

    expect(pings()).toBe(1);
    expect(result.current.requests).toHaveLength(1);
  });

  it('says a ping asked for with the socket down did not leave — S-140', () => {
    // No connection at all: the command never leaves, and a wait for its answer would leave the
    // screen looking busy for something that is not coming.
    const { result } = renderHook(() => usePing());

    act(() => {
      result.current.ping();
    });

    expect(result.current.isSending).toBe(false);
    expect(result.current.error).toMatchObject({
      code: 'NETWORK_UNREACHABLE',
      messageKey: 'common.error.offline',
    });
    expect(sockets.created).toHaveLength(0);
  });

  it('forgets the refusal once a ping leaves', () => {
    const { result } = renderHook(() => usePing());
    act(() => {
      result.current.ping();
    });

    connect();
    act(() => {
      result.current.ping();
    });

    expect(result.current.error).toBeNull();
  });

  it('lists the newest ping first', () => {
    usePingStore.getState().sent('older', 1);
    usePingStore.getState().sent('newer', 2);

    const { result } = renderHook(() => usePing());

    expect(result.current.requests.map((request) => request.nonce)).toEqual(['newer', 'older']);
  });
});
