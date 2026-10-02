import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import {
  BACKOFF_MAX_MS,
  BACKOFF_MIN_MS,
  CLOSE_RATE_LIMITED,
  WsClient,
} from '@/shared/api/ws-client';
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
  let now: number;

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
    now = 1_000_000;
    client = new WsClient({
      url: 'ws://backend.test/ws',
      accessToken: () => token,
      locale: () => 'en',
      appVersion: '0.0.0-test',
      connect: sockets.connect,
      schedule: scheduler.schedule,
      // A fixed draw makes the jitter deterministic without removing it from the code.
      random: () => 0.5,
      now: () => now,
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

    describe('after being rate limited — plan 05, B-05', () => {
      const rateLimited = (retryAfterSeconds: unknown): Record<string, unknown> =>
        serverFrame({
          kind: 'error',
          type: 'error',
          payload: {
            code: 'RATE_LIMITED',
            messageKey: 'common.error.rateLimited',
            params: { retryAfterSeconds },
          },
        });

      it('comes back no sooner than the server asked, after a 4429', () => {
        const socket = connectAndReady();
        socket.receive(rateLimited(12));

        socket.close(CLOSE_RATE_LIMITED);

        expect(scheduler.delays).toEqual([12_000]);
      });

      it('counts the wait from when it was asked, not from when the socket closed', () => {
        const socket = connectAndReady();
        socket.receive(rateLimited(12));
        now += 10_000;

        socket.close(CLOSE_RATE_LIMITED);

        expect(scheduler.delays).toEqual([BACKOFF_MIN_MS * 2]);
      });

      it('never comes back at once after a 4429, even with nothing to go by', () => {
        connectAndReady().close(CLOSE_RATE_LIMITED);

        expect(scheduler.delays[0]).toBeGreaterThanOrEqual(BACKOFF_MIN_MS);
      });

      it('ignores a Retry-After it cannot read', () => {
        const socket = connectAndReady();
        socket.receive(rateLimited('soon'));

        socket.close(CLOSE_RATE_LIMITED);

        expect(scheduler.delays).toEqual([BACKOFF_MIN_MS]);
      });

      it('keeps the ordinary backoff for any other close', () => {
        const socket = connectAndReady();
        socket.receive(rateLimited(12));

        socket.close(4408);

        expect(scheduler.delays).toEqual([BACKOFF_MIN_MS]);
      });

      it('S-81 — holds the connection as throttled until the wait is over, then reconnects', () => {
        const statuses: string[] = [];
        client.onStatus((status) => statuses.push(status));
        const socket = connectAndReady();
        socket.receive(rateLimited(12));

        socket.close(CLOSE_RATE_LIMITED);
        expect(statuses.at(-1)).toBe('throttled');

        scheduler.fire();
        expect(statuses.at(-1)).toBe('connecting');
      });

      it('S-81 — any other close is an ordinary reconnection, even after a refusal', () => {
        const statuses: string[] = [];
        client.onStatus((status) => statuses.push(status));
        const socket = connectAndReady();
        socket.receive(rateLimited(12));

        socket.close(4408);

        expect(statuses.at(-1)).toBe('reconnecting');
        expect(statuses).not.toContain('throttled');
      });
    });

    describe('on request — plan 06, S-200', () => {
      it('tries now instead of waiting out the backoff, and drops the attempt it was waiting on', () => {
        connectAndReady();
        sockets.latest.drop();

        expect(client.reconnect()).toBe(true);
        expect(sockets.created).toHaveLength(2);

        scheduler.fire();
        expect(sockets.created).toHaveLength(2);
      });

      it('comes back after a normal closure by the server too', () => {
        connectAndReady();
        sockets.latest.close(1000);

        expect(client.reconnect()).toBe(true);
        expect(sockets.created).toHaveLength(2);
      });

      it('does nothing with a socket open or opening', () => {
        connectAndReady();
        expect(client.reconnect()).toBe(false);

        sockets.latest.drop();
        client.reconnect();
        expect(client.reconnect()).toBe(false);
        expect(sockets.created).toHaveLength(2);
      });

      it('does nothing for somebody who closed the client — signed out', () => {
        connectAndReady();
        client.close();

        expect(client.reconnect()).toBe(false);
        expect(sockets.created).toHaveLength(1);
      });

      it('never comes back before the server allows, after a 4429', () => {
        connectAndReady().close(CLOSE_RATE_LIMITED);

        expect(client.reconnect()).toBe(false);
        expect(sockets.created).toHaveLength(1);
      });

      it('never comes back before a Retry-After the server gave, whatever the state says', () => {
        const socket = connectAndReady();
        socket.receive(
          serverFrame({
            kind: 'error',
            type: 'error',
            payload: { code: 'RATE_LIMITED', params: { retryAfterSeconds: 30 } },
          }),
        );
        socket.drop();

        expect(client.reconnect()).toBe(false);

        now += 31_000;
        expect(client.reconnect()).toBe(true);
      });
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

    it('resumes from zero when it has nothing yet, so the buffer is replayed — S-88', () => {
      const socket = connectAndReady();

      client.attach('s1', { onEvent: () => undefined, onGap: () => undefined, lastSeq: () => 0 });

      expect(socket.frames().at(-1)?.['payload']).toEqual({ sessionId: 's1', resumeFromSeq: 0 });
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

    it('tells who listens that a session began or ended, watched or not — plan 08, D-10', () => {
      const heard: string[] = [];
      const socket = connectAndReady();
      client.attach('s1', { onEvent: () => undefined, onGap: () => undefined, lastSeq: () => 0 });
      const stop = client.onSessionLifecycle((frame) =>
        heard.push(`${frame.type}:${String(frame.sessionId)}`),
      );

      socket.receive(serverFrame({ sessionId: 'brand-new', seq: 1, type: 'session.started' }));
      socket.receive(serverFrame({ sessionId: 's1', seq: 2, type: 'session.closed' }));
      socket.receive(serverFrame({ sessionId: 's1', seq: 3, type: 'message.delta' }));
      stop();
      socket.receive(serverFrame({ sessionId: 's1', seq: 4, type: 'session.closed' }));

      expect(heard).toEqual(['session.started:brand-new', 'session.closed:s1']);
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
      expect(gaps).toHaveBeenCalledWith(null);
    });

    it('hands the subscriber the conversation the ack says to reload from — plan 04, B-07', () => {
      const gaps = vi.fn();
      const socket = connectAndReady();
      client.attach('s1', { onEvent: () => undefined, onGap: gaps, lastSeq: () => 1 });

      socket.receive(
        serverFrame({
          kind: 'ack',
          type: 'session.attached',
          payload: {
            sessionId: 's1',
            replayed: 0,
            oldestAvailableSeq: 900,
            gap: true,
            claudeSessionId: '6b41b192-a41b-46c2-b8d7-5098d8c825be',
          },
        }),
      );

      expect(gaps).toHaveBeenCalledWith('6b41b192-a41b-46c2-b8d7-5098d8c825be');
    });

    it('offers an attach nobody here asked for to the observers — a resume that joined, S-24', () => {
      const seen: Envelope[] = [];
      const socket = connectAndReady();
      client.observe((frame) => seen.push(frame));

      socket.receive(
        serverFrame({
          kind: 'ack',
          type: 'session.attached',
          payload: { sessionId: 's9', replayed: 0, oldestAvailableSeq: 1, gap: false },
        }),
      );

      expect(seen.map((frame) => frame.type)).toEqual(['session.attached']);
    });

    it('keeps an attach of a watched session away from the observers', () => {
      const seen: Envelope[] = [];
      const socket = connectAndReady();
      client.attach('s1', { onEvent: () => undefined, onGap: () => undefined, lastSeq: () => 0 });
      client.observe((frame) => seen.push(frame));

      socket.receive(
        serverFrame({
          kind: 'ack',
          type: 'session.attached',
          payload: { sessionId: 's1', replayed: 0, oldestAvailableSeq: 1, gap: false },
        }),
      );

      expect(seen).toEqual([]);
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
    it('answers the id of a command it sent, and nothing for one that did not leave', () => {
      expect(client.issue('diag.ping', { nonce: 'n' })).toBeNull();

      const socket = connectAndReady();
      const id = client.issue('diag.ping', { nonce: 'n' });

      expect(id).toBe(socket.frames().at(-1)?.['id']);
    });

    it('offers a refusal to the observers, naming the command it refuses', () => {
      const seen: Envelope[] = [];
      const socket = connectAndReady();
      client.observe((frame) => seen.push(frame));

      socket.receive(
        serverFrame({
          kind: 'error',
          type: 'error',
          correlationId: 'cmd-1',
          payload: { code: 'SESSION_NOT_FOUND', messageKey: 'session.error.notFound' },
        }),
      );

      expect(seen).toMatchObject([{ kind: 'error', correlationId: 'cmd-1' }]);
    });

    it('offers the answer to a folder watch to the observers — 07 · B-28', () => {
      const seen: Envelope[] = [];
      const socket = connectAndReady();
      client.observe((frame) => seen.push(frame));

      socket.receive(
        serverFrame({
          kind: 'ack',
          type: 'workspace.watching',
          correlationId: 'cmd-1',
          payload: { watchId: 'w1', workspacePath: '/r/app' },
        }),
      );
      socket.receive(serverFrame({ kind: 'ack', type: 'command.accepted', payload: {} }));

      expect(seen).toMatchObject([{ type: 'workspace.watching', correlationId: 'cmd-1' }]);
    });

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
