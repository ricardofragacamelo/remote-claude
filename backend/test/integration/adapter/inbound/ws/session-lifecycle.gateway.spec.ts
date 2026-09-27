import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import { SessionRegistry } from '@application/session';
import { CLOCK } from '@application/shared';
import { APP_CONFIG } from '@infra/config/environment';
import type { AppConfig } from '@infra/config/environment';
import { SessionReaperJob } from '@infra/jobs/session-reaper.job';
import { AppGateway } from '@infra/websocket/app.gateway';
import { WS_SETTINGS, wsSettingsFrom } from '@infra/websocket/limits';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import type { ScriptRecord } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { FixedClock } from '../../../../support/fakes/fixed-clock';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestAllowlist, TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

/** The shortest TTL the configuration accepts: a second. */
const TTL_MS = 1_000;

/** A heartbeat a suite can watch several beats of, instead of thirty seconds for one. */
const HEARTBEAT = { heartbeatIntervalMs: 150, heartbeatTimeoutMs: 100 };

async function authenticate(socket: TestSocket, identity: IdentityServer): Promise<Envelope> {
  socket.send(
    commandFrame('connection.authenticate', {
      token: await identity.accessToken({ subject: SUBJECT }),
      locale: 'en',
      client: { kind: 'web', version: '0.0.0' },
    }),
  );

  return socket.next();
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

describe('the life of a session on the installation — plan 05, F0', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let allowlist: TestAllowlist;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    allowlist = writeTestAllowlist([SUBJECT]);
  });

  afterAll(async () => {
    await identity.stop();
    await database.stop();
  });

  describe('idle sessions, and a heartbeat under load — B-02, B-07', () => {
    let harness: TestApp;
    let clock: FixedClock;
    const open: TestSocket[] = [];

    beforeAll(async () => {
      clock = new FixedClock(new Date());
      const scripted = scriptedSdk({ fixture: 'tool-turn' });

      harness = await startTestApp(
        database.url,
        identity,
        (builder) =>
          builder
            .overrideProvider(QUERY_FACTORY)
            .useValue(scripted.createQuery)
            .overrideProvider(CLOCK)
            .useValue(clock)
            .overrideProvider(WS_SETTINGS)
            .useFactory({
              inject: [APP_CONFIG],
              factory: (config: AppConfig) => ({ ...wsSettingsFrom(config), ...HEARTBEAT }),
            }),
        allowlist,
        {
          RC_SESSION_IDLE_TTL_MS: String(TTL_MS),
          // Long, so a permission is still pending when the reaper looks at it.
          RC_PERMISSION_TIMEOUT_MS: '60000',
          RC_WS_MAX_FRAMES_PER_SECOND: '100',
        },
      );
    });

    afterAll(async () => {
      for (const socket of open) {
        socket.close();
      }
      await harness.close();
    });

    afterEach(async () => {
      // Whatever a test left open is put away, so the next one starts from an empty installation.
      clock.advance(10 * TTL_MS);
      await harness.app.get(SessionReaperJob).sweep();
    });

    async function connect(): Promise<TestSocket> {
      const socket = await TestSocket.open(harness.url);
      open.push(socket);
      await authenticate(socket, identity);

      return socket;
    }

    async function start(socket: TestSocket): Promise<string> {
      socket.send(commandFrame('session.start', { workspacePath: allowlist.root }));
      return String((await until(socket, 'session.started')).payload?.['sessionId']);
    }

    const reap = (): Promise<number> => harness.app.get(SessionReaperJob).sweep();

    it('closes a session idle past the TTL, and tells whoever watches it — S-04', async () => {
      const socket = await connect();
      const sessionId = await start(socket);

      clock.advance(TTL_MS);
      expect(await reap()).toBe(1);

      const closed = await until(socket, 'session.closed');
      expect(closed.payload).toEqual({ sessionId, reason: 'idleTimeout' });
      expect(harness.app.get(SessionRegistry).size).toBe(0);
    });

    it('leaves a session somebody used inside the TTL', async () => {
      const socket = await connect();
      const sessionId = await start(socket);

      clock.advance(TTL_MS - 100);
      socket.send(commandFrame('session.setModel', { sessionId, model: 'claude-opus-5' }));
      await until(socket, 'command.accepted');
      clock.advance(200);

      expect(await reap()).toBe(0);
    });

    it('never closes a session waiting for permission, however long — S-05', async () => {
      const socket = await connect();
      const sessionId = await start(socket);
      socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));
      await until(socket, 'permission.requested');

      clock.advance(60 * TTL_MS);

      expect(await reap()).toBe(0);
      expect(harness.app.get(SessionRegistry).size).toBe(1);
    });

    it('keeps answering the heartbeat while the client keeps it busy — S-60', async () => {
      const socket = await connect();
      let pings = 0;
      const beats = new Promise<void>((resolve) => {
        socket.onPing(() => {
          pings += 1;
          if (pings === 4) {
            resolve();
          }
        });
      });

      // Frames all the way through four beats: a heartbeat that slipped under load would close a
      // perfectly healthy connection with 4408.
      const busy = setInterval(() => {
        socket.send(commandFrame('session.detach', { sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ' }));
      }, 20);

      try {
        await beats;
      } finally {
        clearInterval(busy);
      }

      expect(socket.isOpen).toBe(true);
    });

    it('closes with 4408 a client that stops answering the heartbeat', async () => {
      const raw = new WebSocket(`${harness.url.replace(/^http/, 'ws')}/ws?v=1`, {
        autoPong: false,
      });
      const closed = new Promise<number>((resolve) => {
        raw.on('close', (code: number) => resolve(code));
      });
      await new Promise((resolve) => raw.on('open', resolve));

      raw.send(
        JSON.stringify(
          commandFrame('connection.authenticate', {
            token: await identity.accessToken({ subject: SUBJECT }),
            locale: 'en',
            client: { kind: 'web', version: '0.0.0' },
          }),
        ),
      );

      await expect(closed).resolves.toBe(4408);
    });
  });

  describe('the shutdown — B-04', () => {
    let harness: TestApp;
    let record: ScriptRecord;

    beforeAll(async () => {
      const scripted = scriptedSdk({ silent: true });
      record = scripted.record;

      harness = await startTestApp(
        database.url,
        identity,
        (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery),
        allowlist,
      );
    });

    it('announces every session, closes every socket with 1001 and every subprocess — S-08, S-09', async () => {
      const socket = await TestSocket.open(harness.url);
      await authenticate(socket, identity);
      socket.send(commandFrame('session.start', { workspacePath: allowlist.root }));
      const sessionId = String((await until(socket, 'session.started')).payload?.['sessionId']);
      const registry = harness.app.get(SessionRegistry);

      await harness.close();

      await expect(until(socket, 'session.closed')).resolves.toMatchObject({
        payload: { sessionId, reason: 'shutdown' },
      });
      await expect(socket.closed()).resolves.toMatchObject({ code: 1001 });
      expect(record.closes).toBe(1);
      expect(registry.all()).toEqual([]);
    });

    it('closes at once a socket that arrives once the shutdown has begun', async () => {
      const scripted = scriptedSdk({ silent: true });
      const late = await startTestApp(
        database.url,
        identity,
        (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery),
        allowlist,
      );

      late.app.get(AppGateway).stopAccepting();
      const socket = await TestSocket.open(late.url);

      await expect(socket.closed()).resolves.toMatchObject({ code: 1001 });
      await late.close();
    });
  });
});
