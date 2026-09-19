import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { BACKOFF_MAX_MS, BACKOFF_MIN_MS, WsClient } from '@/shared/api/ws-client';
import { FakeSocket, ManualScheduler, SocketFactory } from '../../../support/fake-socket';

/** A frame as the server would send it. */
function serverFrame(overrides: Partial<Envelope>): Record<string, unknown> {
  return {
    v: 1,
    id: 'srv-1',
    kind: 'event',
    type: 'diag.pong',
    ts: '2026-09-13T12:00:00.000Z',
    ...overrides,
  };
}

const ready = serverFrame({
  kind: 'ack',
  type: 'connection.ready',
  payload: { connectionId: 'c1' },
});

describe('WsClient', () => {
  let sockets: SocketFactory;
  let scheduler: ManualScheduler;
  let token: string | null;
  let client: WsClient;

  /** Opens the socket and completes the handshake. */
  function connectAndReady(): FakeSocket {
    client.connect();
    sockets.latest.open();
    sockets.latest.receive(ready);
    return sockets.latest;
  }

  beforeEach(() => {
    sockets = new SocketFactory();
    scheduler = new ManualScheduler();
    token = 'token-1';
    client = new WsClient({
      url: 'ws://backend.test/ws',
      accessToken: () => token,
      locale: () => 'en',
      appVersion: '0.0.0-test',
      connect: sockets.connect,
      schedule: scheduler.schedule,
      // A fixed draw makes the jitter deterministic without removing it from the code.
      random: () => 0.5,
    });
  });

  describe('the handshake', () => {
    it('opens on the protocol version this build speaks', () => {
      client.connect();

      expect(sockets.latest.url).toBe('ws://backend.test/ws?v=1');
    });

    it('sends the token in the frame body, never in the query string', () => {
      client.connect();
      sockets.latest.open();

      expect(sockets.latest.url).not.toContain('token');
      expect(sockets.latest.frames()[0]).toMatchObject({
        type: 'connection.authenticate',
        payload: { token: 'token-1', locale: 'en', client: { kind: 'web', version: '0.0.0-test' } },
      });
    });

    it('does not open a socket it cannot authenticate', () => {
      token = null;
      client.connect();
      sockets.latest.open();

      expect(sockets.latest.closedWith).toBe(1000);
      expect(sockets.latest.sent).toEqual([]);
    });

    it('reports ready once the server acknowledges', () => {
      const seen: string[] = [];
      client.onStatus((status) => seen.push(status));

      connectAndReady();

      expect(seen).toEqual(['idle', 'connecting', 'ready']);
    });

    it('renews the credential without dropping the socket', () => {
      const socket = connectAndReady();

      client.reauthenticate('token-2');

      expect(socket.closedWith).toBeNull();
      expect(socket.frames().at(-1)).toMatchObject({
        type: 'connection.reauthenticate',
        payload: { token: 'token-2' },
      });
    });
  });

  describe('reconnection', () => {
    it('backs off exponentially between attempts', () => {
      expect(client.backoffFor(1)).toBe(BACKOFF_MIN_MS);
      expect(client.backoffFor(2)).toBeGreaterThan(client.backoffFor(1));
      expect(client.backoffFor(3)).toBeGreaterThan(client.backoffFor(2));
    });

    it('never waits longer than the ceiling, and never less than the floor', () => {
      for (const attempt of [1, 5, 10, 50]) {
        expect(client.backoffFor(attempt)).toBeGreaterThanOrEqual(BACKOFF_MIN_MS);
        expect(client.backoffFor(attempt)).toBeLessThanOrEqual(BACKOFF_MAX_MS);
      }
    });

    it('jitters, so every client does not come back at the same instant', () => {
      const jittered = new WsClient({
        url: 'ws://backend.test/ws',
        accessToken: () => 't',
        locale: () => 'en',
        appVersion: '0',
        connect: sockets.connect,
        schedule: scheduler.schedule,
        random: vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(1),
      });

      expect(jittered.backoffFor(5)).not.toBe(jittered.backoffFor(5));
    });

    it('never reconnects in a tight loop', () => {
      connectAndReady();

      sockets.latest.drop();

      expect(scheduler.delays[0]).toBeGreaterThanOrEqual(BACKOFF_MIN_MS);
    });

    it('opens a new socket when the delay elapses', () => {
      connectAndReady();
      sockets.latest.drop();

      scheduler.fire();

      expect(sockets.created).toHaveLength(2);
    });

    it('does not reconnect after a normal closure', () => {
      connectAndReady();

      sockets.latest.close(1000);

      expect(scheduler.delays).toEqual([]);
    });

    it('does not reconnect after the client asked to close', () => {
      connectAndReady();

      client.close();

      expect(scheduler.delays).toEqual([]);
    });

    it('starts the backoff over once it is ready again', () => {
      connectAndReady();
      sockets.latest.drop();
      scheduler.fire();
      sockets.latest.open();
      sockets.latest.receive(ready);

      sockets.latest.drop();

      expect(scheduler.delays[1]).toBe(scheduler.delays[0]);
    });
  });

  describe('a session', () => {
    it('asks to attach, and resumes from where the subscriber left off', () => {
      const socket = connectAndReady();

      client.attach('s1', { onEvent: () => undefined, onGap: () => undefined, lastSeq: () => 7 });

      expect(socket.frames().at(-1)).toMatchObject({
        type: 'session.attach',
        payload: { sessionId: 's1', resumeFromSeq: 7 },
      });
    });

    it('asks for no resume when it has nothing yet', () => {
      const socket = connectAndReady();

      client.attach('s1', { onEvent: () => undefined, onGap: () => undefined, lastSeq: () => 0 });

      expect(socket.frames().at(-1)?.['payload']).toEqual({ sessionId: 's1' });
    });

    it('re-attaches everything it was watching after a reconnect', () => {
      connectAndReady();
      client.attach('s1', { onEvent: () => undefined, onGap: () => undefined, lastSeq: () => 3 });

      sockets.latest.drop();
      scheduler.fire();
      sockets.latest.open();
      sockets.latest.receive(ready);

      expect(sockets.latest.frames().at(-1)).toMatchObject({
        type: 'session.attach',
        payload: { sessionId: 's1', resumeFromSeq: 3 },
      });
    });

    it('delivers events of that session to its subscriber', () => {
      const events: Envelope[] = [];
      const socket = connectAndReady();
      client.attach('s1', {
        onEvent: (frame) => events.push(frame),
        onGap: () => undefined,
        lastSeq: () => 0,
      });

      socket.receive(serverFrame({ sessionId: 's1', seq: 1, payload: { nonce: 'n' } }));

      expect(events).toHaveLength(1);
      expect(events[0]?.seq).toBe(1);
    });

    it('does not deliver another session’s events', () => {
      const events: Envelope[] = [];
      const socket = connectAndReady();
      client.attach('s1', {
        onEvent: (frame) => events.push(frame),
        onGap: () => undefined,
        lastSeq: () => 0,
      });

      socket.receive(serverFrame({ sessionId: 's2', seq: 1 }));

      expect(events).toEqual([]);
    });

    it('offers an event for a session nobody has attached to yet', () => {
      const seen: Envelope[] = [];
      const socket = connectAndReady();
      client.observe((frame) => seen.push(frame));

      socket.receive(serverFrame({ sessionId: 'brand-new', seq: 1 }));

      expect(seen).toHaveLength(1);
    });

    it('stops offering once the observer unsubscribes', () => {
      const seen: Envelope[] = [];
      const socket = connectAndReady();
      const stop = client.observe((frame) => seen.push(frame));

      stop();
      socket.receive(serverFrame({ sessionId: 'brand-new', seq: 1 }));

      expect(seen).toEqual([]);
    });

    it('detaching stops the delivery and tells the server', () => {
      const events: Envelope[] = [];
      const socket = connectAndReady();
      const detach = client.attach('s1', {
        onEvent: (frame) => events.push(frame),
        onGap: () => undefined,
        lastSeq: () => 0,
      });

      detach();
      socket.receive(serverFrame({ sessionId: 's1', seq: 1 }));

      expect(events).toEqual([]);
      expect(socket.frames().at(-1)).toMatchObject({ type: 'session.detach' });
    });

    it('tells the subscriber to reload when the replay has a gap', () => {
      const gaps = vi.fn();
      const socket = connectAndReady();
      client.attach('s1', { onEvent: () => undefined, onGap: gaps, lastSeq: () => 1 });

      socket.receive(
        serverFrame({
          kind: 'ack',
          type: 'session.attached',
          payload: { sessionId: 's1', replayed: 0, oldestAvailableSeq: 900, gap: true },
        }),
      );

      expect(gaps).toHaveBeenCalledTimes(1);
    });

    it('says nothing when the replay had no gap', () => {
      const gaps = vi.fn();
      const socket = connectAndReady();
      client.attach('s1', { onEvent: () => undefined, onGap: gaps, lastSeq: () => 1 });

      socket.receive(
        serverFrame({
          kind: 'ack',
          type: 'session.attached',
          payload: { sessionId: 's1', replayed: 2, oldestAvailableSeq: 1, gap: false },
        }),
      );

      expect(gaps).not.toHaveBeenCalled();
    });
  });

  describe('frames it will not act on', () => {
    it.each([
      ['text that is not JSON', '{not json'],
      ['a frame with no envelope fields', JSON.stringify({ hello: true })],
      ['a frame of the wrong protocol version', JSON.stringify(serverFrame({ v: 2 as never }))],
    ])('drops %s without throwing', (_case, raw) => {
      const socket = connectAndReady();

      expect(() => socket.onmessage?.({ data: raw })).not.toThrow();
    });

    it('accepts a frame carrying a field it does not know', () => {
      const events: Envelope[] = [];
      const socket = connectAndReady();
      client.attach('s1', {
        onEvent: (frame) => events.push(frame),
        onGap: () => undefined,
        lastSeq: () => 0,
      });

      socket.receive({ ...serverFrame({ sessionId: 's1', seq: 1 }), somethingNew: true });

      expect(events).toHaveLength(1);
    });
  });

  describe('sending', () => {
    it('sends a command once the connection is ready', () => {
      const socket = connectAndReady();

      expect(client.command('diag.ping', { nonce: 'n' })).toBe(true);
      expect(socket.frames().at(-1)).toMatchObject({ kind: 'command', type: 'diag.ping' });
    });

    it('refuses to pretend a command left while the socket is down', () => {
      client.connect();

      expect(client.command('diag.ping', { nonce: 'n' })).toBe(false);
    });

    it('connecting twice does not open a second socket', () => {
      connectAndReady();

      client.connect();

      expect(sockets.created).toHaveLength(1);
    });

    it('stops watching the status on request', () => {
      const seen: string[] = [];
      const stop = client.onStatus((status) => seen.push(status));

      stop();
      connectAndReady();

      expect(seen).toEqual(['idle']);
    });

    it('reports an error on the socket without throwing', () => {
      client.connect();

      expect(() => sockets.latest.onerror?.({})).not.toThrow();
    });
  });
});
