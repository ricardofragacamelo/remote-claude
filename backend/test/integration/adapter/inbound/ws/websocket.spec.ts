import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

describe('the WebSocket gateway', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  const open: TestSocket[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    harness = await startTestApp(database.url, identity);
  });

  afterAll(async () => {
    for (const socket of open) {
      socket.close();
    }
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  /** A socket that is tracked for teardown. */
  async function connect(): Promise<TestSocket> {
    const socket = await TestSocket.open(harness.url);
    open.push(socket);
    return socket;
  }

  /** A socket that has completed the handshake, and the ready ack it received. */
  async function authenticated(
    subject = 'auth|42',
  ): Promise<{ socket: TestSocket; connectionId: string }> {
    const socket = await connect();
    socket.send(
      commandFrame('connection.authenticate', {
        token: await identity.accessToken({ subject }),
        locale: 'en',
        client: { kind: 'web', version: '0.0.0' },
      }),
    );

    const ready = await socket.next();
    return {
      socket,
      connectionId: String((ready.payload as { connectionId: string }).connectionId),
    };
  }

  describe('the handshake', () => {
    it('answers a valid handshake with connection.ready and the limits it enforces', async () => {
      const socket = await connect();

      socket.send(
        commandFrame('connection.authenticate', {
          token: await identity.accessToken(),
          locale: 'pt-BR',
          client: { kind: 'web', version: '0.0.0' },
        }),
      );
      const ready = await socket.next();

      expect(ready).toMatchObject({ kind: 'ack', type: 'connection.ready' });
      expect(ready.payload).toMatchObject({
        connectionId: expect.any(String),
        serverVersion: '1',
        limits: { maxFrameBytes: 65_536, replayBufferSize: 1_000 },
      });
    });

    it('closes with 4401 when nobody authenticates inside the window', async () => {
      const socket = await connect();

      await expect(socket.closed()).resolves.toMatchObject({ code: 4401 });
    });

    it('closes with 4401 on a token it cannot verify, instead of keeping the socket', async () => {
      const socket = await connect();

      socket.send(
        commandFrame('connection.authenticate', {
          token: await identity.provider.forgedToken(),
          locale: 'en',
          client: { kind: 'web', version: '0.0.0' },
        }),
      );

      await expect(socket.closed()).resolves.toMatchObject({ code: 4401 });
    });

    it('closes with 4401 on a handshake payload that is not one', async () => {
      const socket = await connect();

      socket.send(commandFrame('connection.authenticate', { nothing: true }));

      await expect(socket.closed()).resolves.toMatchObject({ code: 4401 });
    });

    it('closes with 4426 for a protocol version it does not speak', async () => {
      const socket = await connect();

      socket.send(commandFrame('connection.authenticate', {}, { v: 2 as never }));

      await expect(socket.closed()).resolves.toMatchObject({ code: 4426 });
    });

    it('says which versions it speaks before closing, so the client can tell its user', async () => {
      const socket = await connect();

      socket.send(commandFrame('connection.authenticate', {}, { v: 2 as never }));
      const answer = await socket.next();

      expect(answer).toMatchObject({ kind: 'error', type: 'error' });
      expect(answer.payload).toMatchObject({
        code: 'INVALID_INPUT',
        messageKey: 'connection.error.unsupportedVersion',
        params: { supportedVersions: [1] },
      });
    });

    // `seq` is there because the envelope now requires one on every event: without it the frame
    // would be refused as malformed, and this test would stop exercising the kind check it exists
    // for. A well-formed event from a client is still a protocol violation.
    it('closes with 4400 when the client sends a kind only the server may send', async () => {
      const socket = await connect();

      socket.send(commandFrame('diag.pong', {}, { kind: 'event', seq: 1 }));

      await expect(socket.closed()).resolves.toMatchObject({ code: 4400 });
    });

    it('answers an error, and does not close, for an event with no seq at all', async () => {
      const socket = await connect();

      socket.send(commandFrame('diag.pong', {}, { kind: 'event' }));
      const answer = await socket.next();

      expect(answer.payload).toMatchObject({ code: 'INVALID_INPUT' });
      expect(socket.isOpen).toBe(true);
    });

    it('refuses a second handshake without swapping the identity', async () => {
      const { socket } = await authenticated();

      socket.send(
        commandFrame('connection.authenticate', {
          token: await identity.accessToken({ subject: 'auth|someone-else' }),
          locale: 'en',
          client: { kind: 'web', version: '0.0.0' },
        }),
      );
      const answer = await socket.next();

      expect(answer.kind).toBe('error');
      expect(answer.payload).toMatchObject({ code: 'INVALID_INPUT' });
      expect(socket.isOpen).toBe(true);
    });

    it('renews the credential on an open socket without dropping it', async () => {
      const { socket } = await authenticated();

      socket.send(
        commandFrame('connection.reauthenticate', { token: await identity.accessToken() }),
      );
      const ack = await socket.next();

      expect(ack).toMatchObject({ kind: 'ack', type: 'command.accepted' });
      expect(ack.payload).toMatchObject({ command: 'connection.reauthenticate' });
      expect(socket.isOpen).toBe(true);
    });

    it('closes with 4401 when the renewed credential is refused', async () => {
      const { socket } = await authenticated();

      socket.send(
        commandFrame('connection.reauthenticate', { token: await identity.provider.forgedToken() }),
      );

      await expect(socket.closed()).resolves.toMatchObject({ code: 4401 });
    });
  });

  describe('a frame the gateway cannot act on', () => {
    it('answers an error and keeps the socket, for text that is not JSON', async () => {
      const socket = await connect();

      socket.send('{not json');
      const answer = await socket.next();

      expect(answer.kind).toBe('error');
      expect(answer.payload).toMatchObject({ code: 'INVALID_INPUT' });
      expect(socket.isOpen).toBe(true);
    });

    it('answers PAYLOAD_TOO_LARGE for a frame over the announced limit', async () => {
      const socket = await connect();

      socket.send(commandFrame('diag.ping', { nonce: 'x'.repeat(70_000) }));
      const answer = await socket.next();

      expect(answer.payload).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', httpEquivalent: 413 });
      expect(socket.isOpen).toBe(true);
    });

    it('answers UNAUTHENTICATED for a command that arrives before the handshake', async () => {
      const socket = await connect();

      socket.send(commandFrame('diag.ping', { nonce: 'n' }));
      const answer = await socket.next();

      expect(answer.payload).toMatchObject({ code: 'UNAUTHENTICATED', httpEquivalent: 401 });
      expect(socket.isOpen).toBe(true);
    });

    it('answers INVALID_INPUT for a command it has no handler for', async () => {
      const { socket } = await authenticated();

      socket.send(commandFrame('session.explode', {}));
      const answer = await socket.next();

      expect(answer.payload).toMatchObject({ code: 'INVALID_INPUT' });
      expect(socket.isOpen).toBe(true);
    });

    it('correlates the error with the command that caused it', async () => {
      const { socket } = await authenticated();
      const frame = commandFrame('diag.ping', {});

      socket.send(frame);
      const answer = await socket.next();

      expect(answer.correlationId).toBe(frame['id']);
    });
  });

  describe('the vertical slice', () => {
    it('answers diag.ping with an ack and then the pong event', async () => {
      const { socket } = await authenticated();

      socket.send(commandFrame('diag.ping', { nonce: 'first' }));
      const ack = await socket.next();
      const pong = await socket.next();

      expect(ack).toMatchObject({ kind: 'ack', type: 'command.accepted' });
      expect(pong).toMatchObject({ kind: 'event', type: 'diag.pong', seq: 1 });
      expect(pong.payload).toMatchObject({ nonce: 'first', pingCount: 1 });
      expect(pong.sessionId).toEqual(expect.any(String));
    });

    it('numbers the events of one session strictly upwards', async () => {
      const { socket } = await authenticated();

      socket.send(commandFrame('diag.ping', { nonce: 'a' }));
      await socket.next();
      const first = await socket.next();

      socket.send(commandFrame('diag.ping', { sessionId: first.sessionId, nonce: 'b' }));
      await socket.next();
      const second = await socket.next();

      expect([first.seq, second.seq]).toEqual([1, 2]);
      expect(second.payload).toMatchObject({ pingCount: 2 });
    });

    it('persists the count, so a third ping continues where the second left off', async () => {
      const { socket } = await authenticated();

      socket.send(commandFrame('diag.ping', { nonce: 'a' }));
      await socket.next();
      const opened = await socket.next();

      for (const nonce of ['b', 'c']) {
        socket.send(commandFrame('diag.ping', { sessionId: opened.sessionId, nonce }));
        await socket.next();
        await socket.next();
      }

      socket.send(commandFrame('diag.ping', { sessionId: opened.sessionId, nonce: 'd' }));
      await socket.next();
      const fourth = await socket.next();

      expect(fourth.payload).toMatchObject({ pingCount: 4 });
    });

    it('answers SESSION_NOT_FOUND for a session that does not exist', async () => {
      const { socket } = await authenticated();

      socket.send(
        commandFrame('diag.ping', { sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ', nonce: 'n' }),
      );
      const answer = await socket.next();

      expect(answer.payload).toMatchObject({ code: 'SESSION_NOT_FOUND', httpEquivalent: 404 });
    });

    it("answers FORBIDDEN for somebody else's session — D-17", async () => {
      const mine = await authenticated('auth|owner');
      mine.socket.send(commandFrame('diag.ping', { nonce: 'n' }));
      await mine.socket.next();
      const pong = await mine.socket.next();

      const theirs = await authenticated('auth|intruder');
      theirs.socket.send(commandFrame('diag.ping', { sessionId: pong.sessionId, nonce: 'n' }));
      const answer = await theirs.socket.next();

      // The credential is good and the caller is who they say they are; they still may not.
      // That is `403`, and the earlier answer of `404` was a semantics of its own.
      expect(answer.payload).toMatchObject({ code: 'FORBIDDEN', httpEquivalent: 403 });
    });

    it('answers INVALID_INPUT for a session id that is not a ULID', async () => {
      const { socket } = await authenticated();

      socket.send(commandFrame('diag.ping', { sessionId: 'nope', nonce: 'n' }));
      const answer = await socket.next();

      expect(answer.payload).toMatchObject({ code: 'INVALID_INPUT', httpEquivalent: 400 });
    });
  });

  /**
   * Fan-out, replay and `session.attach` live with the sessions they belong to.
   *
   * They used to be exercised here, over `diag.ping`, because the walking skeleton's counter was
   * the only session there was. It is not a session of Claude, it is not in the live registry, and
   * `session.attach` answers for live sessions only — so the scenarios moved to
   * `session-stream.spec.ts`, where they run against a real turn with a scripted Agent SDK.
   */
  describe('session.attach', () => {
    it('refuses a session that is not running, whoever asks', async () => {
      const { socket } = await authenticated('auth|attach-unknown');

      socket.send(commandFrame('session.attach', { sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ' }));
      const answer = await socket.next();

      // Nothing persists a live session, so "unknown", "closed" and "somebody else's" are one
      // answer — and that is the honest one.
      expect(answer.payload).toMatchObject({ code: 'SESSION_NOT_FOUND', httpEquivalent: 404 });
    });
  });

  /**
   * S-01 — `session.detach`, the debt the bootstrap left open.
   *
   * The web client has been sending it since the walking skeleton, against a contract that had no
   * such command, and getting `INVALID_INPUT` back (S-119 of the bootstrap plan).
   */
  describe('session.detach', () => {
    it('is idempotent — detaching twice answers an ack, never an error', async () => {
      const { socket } = await authenticated('auth|detach-twice');
      const sessionId = '01J0ABCDEFGHJKMNPQRSTVWXYZ';

      socket.send(commandFrame('session.detach', { sessionId }));
      await socket.next();
      socket.send(commandFrame('session.detach', { sessionId }));
      const second = await socket.next();

      expect(second).toMatchObject({ kind: 'ack', type: 'command.accepted' });
    });

    it('accepts a detach from a session this connection never watched', async () => {
      const { socket } = await authenticated('auth|detach-stranger');

      socket.send(commandFrame('session.detach', { sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ' }));
      const ack = await socket.next();

      expect(ack).toMatchObject({ kind: 'ack', type: 'command.accepted' });
    });

    it('answers INVALID_INPUT when no session is named', async () => {
      const { socket } = await authenticated('auth|detach-empty');

      socket.send(commandFrame('session.detach', {}));
      const answer = await socket.next();

      expect(answer.payload).toMatchObject({ code: 'INVALID_INPUT' });
      expect(socket.isOpen).toBe(true);
    });
  });

  /** S-86 — the name the bootstrap used is gone, not kept alive beside the new one. */
  describe('the name the bootstrap used', () => {
    it('answers INVALID_INPUT for session.ping, which no longer exists', async () => {
      const { socket } = await authenticated('auth|old-name');

      socket.send(commandFrame('session.ping', { nonce: 'n' }));
      const answer = await socket.next();

      expect(answer.payload).toMatchObject({ code: 'INVALID_INPUT' });
      expect(socket.isOpen).toBe(true);
    });
  });

  describe('the log', () => {
    it('records both directions of every frame', async () => {
      harness.log.lines.length = 0;
      const { socket } = await authenticated();

      socket.send(commandFrame('diag.ping', { nonce: 'logged' }));
      await socket.next();
      await socket.next();

      expect(harness.log.withOp('ws.inbound').length).toBeGreaterThan(0);
      expect(harness.log.withOp('ws.outbound').length).toBeGreaterThan(0);
    });

    it('never writes the token that arrives in the handshake', async () => {
      harness.log.lines.length = 0;
      const token = await identity.accessToken();
      const socket = await connect();

      socket.send(
        commandFrame('connection.authenticate', {
          token,
          locale: 'en',
          client: { kind: 'web', version: '0.0.0' },
        }),
      );
      await socket.next();

      expect(JSON.stringify(harness.log.lines)).not.toContain(token);
    });
  });
});
