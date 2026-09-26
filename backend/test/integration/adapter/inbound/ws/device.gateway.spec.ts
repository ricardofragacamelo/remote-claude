import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

/** Long enough that nothing in this suite is decided by the deadline instead of by a test. */
const TIMEOUT_MS = 5_000;

/**
 * Longer than the deadline, and that is the point.
 *
 * An extension only moves anything when it reaches **past** where the deadline already is —
 * otherwise the entity answers "nothing changed" and the module publishes nothing, correctly. A
 * suite whose increment is smaller than its timeout would be asserting on a no-op.
 */
const EXTENSION_MS = 20_000;

/**
 * What a device may do on the socket, and what a revocation does to one already open.
 *
 * The asymmetry is the whole point of the phase: **a pending device watches a session and does
 * not answer a permission request**. A phone that cannot yet decide can still show what is
 * happening, and hiding the stream from it would turn "wait to be approved" into "the app is
 * broken" (docs/architecture/shared/08-authentication.md#device-e-o-canal-mobile).
 */
describe('a device on the socket', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let root: string;
  const open: TestSocket[] = [];
  const started: { socket: TestSocket; sessionId: string }[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;

    const scripted = scriptedSdk({ fixture: 'tool-turn' });

    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery),
      allowlist,
      {
        RC_PERMISSION_TIMEOUT_MS: String(TIMEOUT_MS),
        RC_PERMISSION_EXTENSION_MS: String(EXTENSION_MS),
      },
    );
  });

  afterEach(async () => {
    for (const { socket, sessionId } of started.splice(0)) {
      if (socket.isOpen) {
        socket.send(commandFrame('session.close', { sessionId }));
        await until(socket, 'session.closed').catch(() => undefined);
      }
    }

    for (const socket of open.splice(0)) {
      socket.close();
    }

    await context().db.execute('DELETE FROM devices');
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());

  const context = (): PersistenceContext =>
    harness.app.get<PersistenceContext>(PERSISTENCE_CONTEXT);

  /** Registers one device over HTTP, exactly as the app does on launch. */
  async function registerDevice(installId: string): Promise<string> {
    const token = await identity.accessToken({ subject: SUBJECT });
    const response = await http()
      .post('/devices')
      .set('authorization', `Bearer ${token}`)
      .send({ installId, name: 'Pixel 8', platform: 'android', appVersion: '1.0.0' });

    return String(response.body.id);
  }

  async function approveDevice(deviceId: string): Promise<void> {
    const token = await identity.accessToken({ subject: SUBJECT });
    await http()
      .post(`/devices/${deviceId}/approval`)
      .set('authorization', `Bearer ${token}`)
      .send({});
  }

  async function revokeDevice(deviceId: string): Promise<void> {
    const token = await identity.accessToken({ subject: SUBJECT });
    await http().delete(`/devices/${deviceId}/approval`).set('authorization', `Bearer ${token}`);
  }

  /** A socket that finished the handshake, as a browser or as a named installation. */
  async function connect(installId?: string): Promise<TestSocket> {
    const socket = await TestSocket.open(harness.url);
    open.push(socket);

    socket.send(
      commandFrame('connection.authenticate', {
        token: await identity.accessToken({ subject: SUBJECT }),
        locale: 'en',
        client:
          installId === undefined
            ? { kind: 'web', version: '0.0.0' }
            : { kind: 'mobile', version: '0.0.0', installId },
      }),
    );

    return socket;
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

  /** Opens a session on a browser socket and stops at the question the recorded run asks. */
  async function askedAbout(socket: TestSocket): Promise<{ sessionId: string; requestId: string }> {
    socket.send(commandFrame('session.start', { workspacePath: root }));
    await socket.next();

    const sessionId = String((await until(socket, 'session.started')).payload?.['sessionId']);
    started.push({ socket, sessionId });

    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));
    const request = await until(socket, 'permission.requested');

    return { sessionId, requestId: String(request.payload?.['requestId']) };
  }

  describe('the handshake', () => {
    it('lets a browser in, which names no installation and is not a device', async () => {
      const socket = await connect();

      expect((await socket.next()).type).toBe('connection.ready');
    });

    // S-03: a pending device gets a socket. It is allowed to watch.
    it('lets a pending device in — S-03', async () => {
      await registerDevice('install-1');

      const socket = await connect('install-1');

      expect((await socket.next()).type).toBe('connection.ready');
    });

    it('refuses an installation nobody registered, with 4401', async () => {
      const socket = await connect('install-unknown');

      expect((await socket.closed()).code).toBe(4401);
    });

    it('refuses a revoked device reconnecting, with 4401', async () => {
      const deviceId = await registerDevice('install-1');
      await approveDevice(deviceId);
      await revokeDevice(deviceId);

      const socket = await connect('install-1');

      expect((await socket.closed()).code).toBe(4401);
    });
  });

  describe('answering a permission request', () => {
    // S-03, on the command that matters: watching is allowed to a pending device.
    it('lets a pending device attach to the session — S-03', async () => {
      await registerDevice('install-1');
      const browser = await connect();
      await browser.next();
      const { sessionId } = await askedAbout(browser);

      const phone = await connect('install-1');
      await phone.next();
      phone.send(commandFrame('session.attach', { sessionId }));

      expect((await phone.next()).type).toBe('session.attached');
    });

    // S-04: the credential is good and the device still may not decide. 403, not 401.
    it('refuses a pending device with DEVICE_NOT_REGISTERED — S-04', async () => {
      await registerDevice('install-1');
      const browser = await connect();
      await browser.next();
      const { sessionId, requestId } = await askedAbout(browser);

      const phone = await connect('install-1');
      await phone.next();
      phone.send(commandFrame('session.attach', { sessionId }));
      await phone.next();

      phone.send({
        ...commandFrame('permission.resolve', { requestId, decision: 'allow' }),
        kind: 'response',
      });

      const error = await until(phone, 'error');

      expect(error.payload).toMatchObject({
        code: 'DEVICE_NOT_REGISTERED',
        httpEquivalent: 403,
      });
    });

    // S-05: and the revoked one gets the other message, because it means something else.
    it('refuses a device revoked after it connected, with DEVICE_REVOKED — S-05', async () => {
      const deviceId = await registerDevice('install-1');
      await approveDevice(deviceId);

      const browser = await connect();
      await browser.next();
      const { sessionId, requestId } = await askedAbout(browser);

      const phone = await connect('install-1');
      await phone.next();
      phone.send(commandFrame('session.attach', { sessionId }));
      await phone.next();

      // Revoked with the socket already open, and **not** through the connection closer: the row
      // alone has to refuse the answer, or the guard would only work when the socket also went.
      await context().db.execute(
        `UPDATE devices SET status = 'revoked', revoked_at = now() WHERE install_id = 'install-1'`,
      );

      phone.send({
        ...commandFrame('permission.resolve', { requestId, decision: 'allow' }),
        kind: 'response',
      });

      expect((await until(phone, 'error')).payload).toMatchObject({
        code: 'DEVICE_REVOKED',
        httpEquivalent: 403,
      });
    });

    it('lets an approved device answer, and records that it came from the app', async () => {
      const deviceId = await registerDevice('install-1');
      await approveDevice(deviceId);

      const browser = await connect();
      await browser.next();
      const { sessionId, requestId } = await askedAbout(browser);

      const phone = await connect('install-1');
      await phone.next();
      phone.send(commandFrame('session.attach', { sessionId }));
      await phone.next();

      phone.send({
        ...commandFrame('permission.resolve', { requestId, decision: 'allow' }),
        kind: 'response',
      });

      const resolved = await until(browser, 'permission.resolved');

      expect(resolved.payload).toMatchObject({ decision: 'allow', resolvedFrom: 'mobile' });
    });

    // Extending does not authorise anything, but it moves the deadline — and the deadline is the
    // only protection there is against a session that hangs for ever. A device that may not
    // decide may not move it either.
    it('refuses a pending device that tries to extend the deadline', async () => {
      await registerDevice('install-1');
      const browser = await connect();
      await browser.next();
      const { sessionId, requestId } = await askedAbout(browser);

      const phone = await connect('install-1');
      await phone.next();
      phone.send(commandFrame('session.attach', { sessionId }));
      await phone.next();

      phone.send(commandFrame('permission.extend', { requestId }));

      expect((await until(phone, 'error')).payload).toMatchObject({
        code: 'DEVICE_NOT_REGISTERED',
      });
    });

    it('lets an approved device extend', async () => {
      const deviceId = await registerDevice('install-1');
      await approveDevice(deviceId);

      const browser = await connect();
      await browser.next();
      const { sessionId, requestId } = await askedAbout(browser);

      const phone = await connect('install-1');
      await phone.next();
      phone.send(commandFrame('session.attach', { sessionId }));
      await phone.next();

      phone.send(commandFrame('permission.extend', { requestId }));

      expect((await until(phone, 'permission.extended')).payload).toMatchObject({ requestId });
    });

    it('still records the browser as the browser', async () => {
      const browser = await connect();
      await browser.next();
      const { requestId } = await askedAbout(browser);

      browser.send({
        ...commandFrame('permission.resolve', { requestId, decision: 'allow' }),
        kind: 'response',
      });

      expect((await until(browser, 'permission.resolved')).payload).toMatchObject({
        resolvedFrom: 'web',
      });
    });
  });

  // S-07: the revocation reaches the socket that is already open, at once, with 4401.
  describe('revoking a device that is connected', () => {
    it('closes its socket immediately, with 4401 — S-07', async () => {
      const deviceId = await registerDevice('install-1');
      await approveDevice(deviceId);

      const phone = await connect('install-1');
      await phone.next();

      await revokeDevice(deviceId);

      expect(await phone.closed()).toMatchObject({ code: 4401 });
    });

    it('leaves the browser of the same person connected', async () => {
      const deviceId = await registerDevice('install-1');
      await approveDevice(deviceId);

      const browser = await connect();
      await browser.next();
      const phone = await connect('install-1');
      await phone.next();

      await revokeDevice(deviceId);
      await phone.closed();

      expect(browser.isOpen).toBe(true);
    });

    it('leaves another installation of the same person connected', async () => {
      const first = await registerDevice('install-1');
      await approveDevice(first);
      const second = await registerDevice('install-2');
      await approveDevice(second);

      const one = await connect('install-1');
      await one.next();
      const two = await connect('install-2');
      await two.next();

      await revokeDevice(first);
      await one.closed();

      expect(two.isOpen).toBe(true);
    });

    // S-08, as this backend can honestly implement it: it never holds the app's refresh token —
    // the app renews straight against the provider — so what revocation guarantees is that the
    // credential stops working **here**, on every transport, from that instant (D-18).
    it('refuses the same credential afterwards, on the socket and over HTTP — S-08', async () => {
      const deviceId = await registerDevice('install-1');
      await approveDevice(deviceId);
      const phone = await connect('install-1');
      await phone.next();

      await revokeDevice(deviceId);
      await phone.closed();

      const again = await connect('install-1');

      expect((await again.closed()).code).toBe(4401);

      const token = await identity.accessToken({ subject: SUBJECT });
      const approvalAttempt = await http()
        .post(`/devices/${deviceId}/approval`)
        .set('authorization', `Bearer ${token}`)
        .set('x-install-id', 'install-1')
        .send({});

      expect(approvalAttempt.status).toBe(403);
    });
  });
});
