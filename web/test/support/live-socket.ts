import { act } from '@testing-library/react';

import { setAccessToken } from '@/shared/api/credentials';
import { wsClient } from '@/shared/api/ws';
import { installFakeWebSocket } from './fake-websocket';
import type { InstalledWebSocket } from './fake-websocket';

const AT = '2026-09-19T12:00:00.000Z';

/** A socket of the real client, driven by the test: connect it, feed it, read what it sent. */
export interface LiveSocket {
  connect(): void;
  receive(...frames: Record<string, unknown>[]): void;

  /** Every frame the client sent, oldest first. */
  sent(): Record<string, unknown>[];

  /** The last frame of a type the client sent. */
  lastSent(type: string): Record<string, unknown> | undefined;

  close(): void;
}

/**
 * The real `wsClient` over a fake platform socket.
 *
 * For the screens that talk over the socket. Written once for the specs of plan 04, because each of
 * them needs the same four moves — and the handshake spelled out in every spec is the part that
 * drifts from what the client actually waits for.
 */
export function aLiveSocket(): LiveSocket {
  setAccessToken('token-1');
  const sockets: InstalledWebSocket = installFakeWebSocket();

  const receive = (...frames: Record<string, unknown>[]): void => {
    act(() => {
      for (const frame of frames) {
        sockets.latest.receive(frame);
      }
    });
  };

  return {
    connect: () => {
      act(() => {
        wsClient.connect();
        sockets.latest.open();
      });
      receive({
        v: 1,
        id: 'srv-0',
        kind: 'ack',
        type: 'connection.ready',
        ts: AT,
        payload: { connectionId: 'c1', serverVersion: '1', limits: {} },
      });
    },
    receive,
    sent: () => sockets.latest.frames(),
    lastSent: (type) => sockets.latest.frames().findLast((frame) => frame['type'] === type),
    close: () => {
      wsClient.close();
      setAccessToken(null);
    },
  };
}

/** A frame as the hub sends it: numbered, and belonging to a session. */
export function hubEvent(
  sessionId: string,
  type: string,
  seq: number,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return { v: 1, id: `evt-${String(seq)}`, kind: 'event', type, ts: AT, sessionId, seq, payload };
}

/** An ack as the gateway sends it. */
export function ack(type: string, payload: Record<string, unknown>): Record<string, unknown> {
  return { v: 1, id: 'ack-1', kind: 'ack', type, ts: AT, payload };
}
