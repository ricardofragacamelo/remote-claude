import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import { OWNER_VALUE, PROCESS_MARKER } from '@adapter/outbound/claude/process-marker';
import { SessionRegistry } from '@application/session';
import { MACHINE_MEMORY } from '@infra/lifecycle/session-capacity';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import type { ScriptRecord } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

/**
 * 600 MB of RAM, half of it for sessions of 256 MB: room for exactly one, whatever the ceiling
 * says. It is the capacity derived from the machine that refuses the second session here, not a
 * number anybody typed (D-01).
 */
const SMALL_MACHINE = 600 * 1024 * 1024;

/** The limits this installation announces and enforces, small enough to reach in a test. */
const FRAMES_PER_SECOND = 5;
const FRAME_BYTES = 2_048;
const ATTACHED = 1;

/**
 * The limits of plan 05, F0, through the real gateway — B-01, B-05, B-06.
 *
 * One installation, configured small: a machine with room for one session, a client allowed five
 * frames a second, and a connection allowed to watch one session at a time.
 */
describe('the limits of the installation, over the gateway', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let record: ScriptRecord;
  let root: string;
  const open: TestSocket[] = [];
  const started: { socket: TestSocket; sessionId: string }[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;
    const scripted = scriptedSdk({ fixture: 'text-turn' });
    record = scripted.record;

    harness = await startTestApp(
      database.url,
      identity,
      (builder) =>
        builder
          .overrideProvider(QUERY_FACTORY)
          .useValue(scripted.createQuery)
          .overrideProvider(MACHINE_MEMORY)
          .useValue(SMALL_MACHINE),
      allowlist,
      {
        RC_SESSION_MAX_CONCURRENT: '3',
        RC_WS_MAX_FRAMES_PER_SECOND: String(FRAMES_PER_SECOND),
        RC_WS_MAX_FRAME_BYTES: String(FRAME_BYTES),
        RC_WS_MAX_ATTACHED_SESSIONS: String(ATTACHED),
      },
    );
  });

  afterEach(async () => {
    for (const { socket, sessionId } of started.splice(0)) {
      if (!socket.isOpen) {
        continue;
      }

      socket.send(commandFrame('session.close', { sessionId }));
      await until(socket, 'session.closed').catch(() => undefined);
    }
  });

  afterAll(async () => {
    for (const socket of open) {
      socket.close();
    }
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  async function connect(): Promise<{ socket: TestSocket; ready: Envelope }> {
    const socket = await TestSocket.open(harness.url);
    open.push(socket);

    socket.send(
      commandFrame('connection.authenticate', {
        token: await identity.accessToken({ subject: SUBJECT }),
        locale: 'en',
        client: { kind: 'web', version: '0.0.0' },
      }),
    );

    return { socket, ready: await socket.next() };
  }

  async function until(socket: TestSocket, type: string, limit = 400): Promise<Envelope> {
    const seen: string[] = [];

    for (let taken = 0; taken < limit; taken += 1) {
      const frame = await socket.next();
      seen.push(
        `${frame.type}${frame.kind === 'error' ? `(${String(frame.payload?.['code'])})` : ''}`,
      );

      if (frame.type === type) {
        return frame;
      }
    }

    throw new Error(`no ${type} in: ${seen.join(', ')}`);
  }

  /** Opens a session and remembers it for teardown. */
  async function start(socket: TestSocket): Promise<string> {
    socket.send(commandFrame('session.start', { workspacePath: root }));
    const sessionId = String((await until(socket, 'session.started')).payload?.['sessionId']);
    started.push({ socket, sessionId });

    return sessionId;
  }

  const live = (): number => harness.app.get(SessionRegistry).size;

  describe('the capacity derived from the RAM — B-01', () => {
    it('refuses the session over the capacity of the machine, with a Retry-After — S-02, S-12', async () => {
      const { socket } = await connect();
      await start(socket);

      const other = (await connect()).socket;
      other.send(commandFrame('session.start', { workspacePath: root }));
      const refusal = await other.next();

      expect(refusal).toMatchObject({ kind: 'error' });
      expect(refusal.payload).toMatchObject({
        code: 'SESSION_LIMIT_REACHED',
        httpEquivalent: 429,
        params: { limit: 1, retryAfterSeconds: 30 },
      });
      expect(live()).toBe(1);
    });

    it('frees the slot the moment a session closes — S-03', async () => {
      const { socket } = await connect();
      const sessionId = await start(socket);

      socket.send(commandFrame('session.close', { sessionId }));
      await until(socket, 'session.closed');
      started.splice(0);

      const other = (await connect()).socket;
      await expect(start(other)).resolves.toEqual(expect.any(String));
    });

    it('lets exactly one of two clients racing for the last slot in — S-13', async () => {
      const [first, second] = await Promise.all([connect(), connect()]);

      first.socket.send(commandFrame('session.start', { workspacePath: root }));
      second.socket.send(commandFrame('session.start', { workspacePath: root }));

      const answers = await Promise.all(
        [first.socket, second.socket].map(async (socket) => {
          const frame = await socket.next();
          if (frame.kind === 'error') {
            return String(frame.payload?.['code']);
          }

          const sessionId = String((await until(socket, 'session.started')).payload?.['sessionId']);
          started.push({ socket, sessionId });
          return 'started';
        }),
      );

      expect(answers.sort()).toEqual(['SESSION_LIMIT_REACHED', 'started']);
      expect(live()).toBe(1);
    });

    it('marks the subprocess as ours, so a later boot can find it — B-03', async () => {
      await start((await connect()).socket);

      expect(record.options?.env?.[PROCESS_MARKER.owner]).toBe(OWNER_VALUE);
      expect(record.options?.env?.[PROCESS_MARKER.parentPid]).toBe(String(process.pid));
    });
  });

  describe('the limits announced in the handshake — B-06', () => {
    it('announces the configured limits, not the defaults', async () => {
      const { ready } = await connect();

      expect(ready.payload?.['limits']).toEqual({
        maxFrameBytes: FRAME_BYTES,
        maxFramesPerSecond: FRAMES_PER_SECOND,
        maxAttachedSessions: ATTACHED,
        replayBufferSize: 1_000,
      });
    });

    it('refuses a frame over the announced size, and keeps the socket — S-11', async () => {
      const { socket } = await connect();

      socket.send(commandFrame('session.detach', { sessionId: 'x'.repeat(FRAME_BYTES) }));
      const refusal = await socket.next();

      expect(refusal.payload).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', httpEquivalent: 413 });
      expect(socket.isOpen).toBe(true);
    });
  });

  describe('the rate of a connection — B-05', () => {
    it('refuses the frame over the rate, then closes with 4429 on the next — S-10, S-12', async () => {
      const { socket } = await connect();

      // The handshake took one of the five; the next four pass, the fifth is refused and the
      // sixth, sent without waiting, is the client not having listened.
      for (let sent = 0; sent < 6; sent += 1) {
        socket.send(commandFrame('session.detach', { sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ' }));
      }

      // The acks of the frames that passed may be lost with the socket — they are answered after
      // their handler runs, and the sixth frame closes it first. The refusal is not: it is sent
      // the instant the frame is counted.
      const refusal = await until(socket, 'error');

      expect(refusal.payload).toMatchObject({
        code: 'RATE_LIMITED',
        httpEquivalent: 429,
        params: { scope: 'frames', limit: FRAMES_PER_SECOND, retryAfterSeconds: 1 },
      });
      await expect(socket.closed()).resolves.toMatchObject({ code: 4429 });
    });

    it('refuses to watch one session more than the connection may, and spawns nothing — S-59', async () => {
      const { socket } = await connect();
      const sessionId = await start(socket);
      const before = record.closes;

      socket.send(commandFrame('session.start', { workspacePath: root }));
      const refusal = await socket.next();

      expect(refusal.payload).toMatchObject({
        code: 'RATE_LIMITED',
        params: { scope: 'attachedSessions', limit: ATTACHED },
      });
      expect(live()).toBe(1);
      expect(record.closes).toBe(before);

      // Watching again what it already watches adds nothing, and is let through.
      socket.send(commandFrame('session.attach', { sessionId }));
      await expect(until(socket, 'session.attached')).resolves.toMatchObject({ kind: 'ack' });
    });
  });
});
