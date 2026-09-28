import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@infra/config/environment';
import type { AppConfig } from '@infra/config/environment';
import { WS_SETTINGS, wsSettingsFrom } from '@infra/websocket/limits';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { waitFor } from '../../../../support/app/wait-for';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

/**
 * The grace an expired credential gets on an open socket, shortened from the protocol's sixty
 * seconds so the suite can watch it run out. Everything else is the product's.
 */
const GRACE_MS = 3_000;

/**
 * A credential that runs out **on an open socket** (plan 05, B-14).
 *
 * The socket does not fall when the token expires: the client renews and hands the new token over
 * with `connection.reauthenticate`. Only silence past the grace closes it — and a "renewal" that
 * is somebody else's token is not a renewal at all.
 * See docs/architecture/shared/05-websocket-protocol.md#handshake.
 */
describe('a credential expiring on an open socket', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  const open: TestSocket[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    harness = await startTestApp(database.url, identity, (builder) =>
      builder.overrideProvider(WS_SETTINGS).useFactory({
        inject: [APP_CONFIG],
        factory: (config: AppConfig) => ({ ...wsSettingsFrom(config), reauthGraceMs: GRACE_MS }),
      }),
    );
  });

  afterAll(async () => {
    for (const socket of open) {
      socket.close();
    }
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  beforeEach(() => {
    harness.log.lines.length = 0;
  });

  /**
   * A socket authenticated with a token about to expire — one to two seconds after the handshake,
   * `exp` being whole seconds — the instant it expires, and the instant its grace runs out.
   *
   * After the handshake and not at it: a token already expired would leave the grace as the whole
   * window, and under the load of the full suite the handshake alone can eat into it.
   */
  async function expiring(): Promise<{ socket: TestSocket; expiry: number; deadline: number }> {
    const expiresAt = new Date(Math.ceil(Date.now() / 1_000) * 1_000 + 1_000);
    const socket = await TestSocket.open(harness.url);
    open.push(socket);

    socket.send(
      commandFrame('connection.authenticate', {
        token: await identity.accessToken({ expiresAt }),
        locale: 'en',
        client: { kind: 'web', version: '0.0.0' },
      }),
    );
    expect(await socket.next()).toMatchObject({ kind: 'ack', type: 'connection.ready' });

    return {
      socket,
      expiry: expiresAt.getTime(),
      deadline: expiresAt.getTime() + GRACE_MS,
    };
  }

  /** A `diag.ping` round trip: the proof the connection still serves this user. */
  async function answersPing(socket: TestSocket): Promise<void> {
    socket.send(commandFrame('diag.ping', { nonce: 'still-here' }));

    expect(await socket.next()).toMatchObject({ kind: 'ack', type: 'command.accepted' });
    expect(await socket.next()).toMatchObject({ kind: 'event', type: 'diag.pong' });
  }

  /** Waits for an instant to pass, polling — the fact under test is that nothing happens. */
  const pastInstant = (instant: number): Promise<number> =>
    waitFor(
      'an instant to pass',
      () => Promise.resolve(Date.now()),
      (now) => now > instant + 250,
      GRACE_MS * 3,
    );

  // S-29
  it('keeps the connection when the renewed token arrives inside the grace', async () => {
    const { socket, expiry, deadline } = await expiring();
    await pastInstant(expiry);

    // Expired, and still serving: the grace is the window the client has to renew in.
    await answersPing(socket);

    socket.send(commandFrame('connection.reauthenticate', { token: await identity.accessToken() }));
    expect(await socket.next()).toMatchObject({
      kind: 'ack',
      type: 'command.accepted',
      payload: { command: 'connection.reauthenticate' },
    });

    await pastInstant(deadline);

    expect(socket.isOpen).toBe(true);
    await answersPing(socket);
  });

  // S-30
  it('closes with 4401 once the grace runs out with no renewal, and not before', async () => {
    const { socket, deadline } = await expiring();
    expect(socket.isOpen).toBe(true);

    const closure = await socket.closed(GRACE_MS * 4);

    expect(closure.code).toBe(4401);
    expect(Date.now()).toBeGreaterThanOrEqual(deadline - 50);
    expect(
      harness.log.withOp('ws.connection').find((line) => line['closeCode'] === 4401),
    ).toMatchObject({ errorCode: 'TOKEN_EXPIRED' });
  });

  // S-69
  describe('a renewal that is not one', () => {
    it('closes with 4401 when the renewed token belongs to another subject', async () => {
      const { socket } = await expiring();

      socket.send(
        commandFrame('connection.reauthenticate', {
          token: await identity.accessToken({ subject: 'auth|someone-else' }),
        }),
      );

      await expect(socket.closed()).resolves.toMatchObject({ code: 4401 });
      expect(
        harness.log.withOp('ws.connection').find((line) => line['closeCode'] === 4401),
      ).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
    });

    it('refuses a renewal before any handshake, and the handshake still works after it', async () => {
      const socket = await TestSocket.open(harness.url);
      open.push(socket);

      socket.send(
        commandFrame('connection.reauthenticate', { token: await identity.accessToken() }),
      );
      const refusal = await socket.next();

      expect(refusal.payload).toMatchObject({ code: 'UNAUTHENTICATED', httpEquivalent: 401 });
      expect(socket.isOpen).toBe(true);

      // Refused as a command, it did not authenticate anything: a command still needs the
      // handshake, and the handshake is still available.
      socket.send(commandFrame('diag.ping', { nonce: 'n' }));
      expect((await socket.next()).payload).toMatchObject({ code: 'UNAUTHENTICATED' });

      socket.send(
        commandFrame('connection.authenticate', {
          token: await identity.accessToken({ subject: SUBJECT }),
          locale: 'en',
          client: { kind: 'web', version: '0.0.0' },
        }),
      );
      expect(await socket.next()).toMatchObject({ kind: 'ack', type: 'connection.ready' });
    });
  });
});
