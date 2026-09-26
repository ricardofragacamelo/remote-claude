import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Envelope } from '@remote-claude/contracts';

import { PUSH_SENDER } from '@application/notification';
import type { PushMessage } from '@domain/notification';
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
import { waitFor } from '../../../../support/app/wait-for';
import { RecordingPushSender } from '../../../../support/fakes/recording-push';

/** Short, because one scenario here is about the deadline withdrawing a notification. */
const TIMEOUT_MS = 1_200;

/**
 * A question reaching a phone, and being taken back, through the real container.
 *
 * Everything between the `canUseTool` bridge and the provider is the shipped code: the internal
 * bus, the two listeners, the use case, the registry, the device repository and PostgreSQL. Only
 * the provider itself is a fixture — which is the same shape as every other outbound integration
 * in this suite, and the only part `02 · F1` says is somebody else's to set up.
 */
/** A question that went out to a device, and the session it belongs to. */
interface Asked {
  readonly socket: TestSocket;
  readonly sessionId: string;
  readonly requestId: string;
}

describe('a question reaching a phone', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let provider: RecordingPushSender;
  let root: string;
  const open: TestSocket[] = [];
  const started: { socket: TestSocket; sessionId: string }[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    provider = new RecordingPushSender();

    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;

    const scripted = scriptedSdk({ fixture: 'tool-turn' });

    harness = await startTestApp(
      database.url,
      identity,
      (builder) =>
        builder
          .overrideProvider(QUERY_FACTORY)
          .useValue(scripted.createQuery)
          .overrideProvider(PUSH_SENDER)
          .useValue(provider),
      allowlist,
      { RC_PERMISSION_TIMEOUT_MS: String(TIMEOUT_MS) },
    );
  });

  afterEach(async () => {
    for (const { socket, sessionId } of started.splice(0)) {
      if (!socket.isOpen) {
        continue;
      }

      // Attached again first, and not out of tidiness: every socket here detached to make the
      // push happen, and a close nobody waits for lets the previous session go on asking while
      // the next test is counting what was sent.
      socket.send(commandFrame('session.attach', { sessionId }));
      await until(socket, 'session.attached').catch(() => undefined);

      socket.send(commandFrame('session.close', { sessionId }));
      await until(socket, 'session.closed').catch(() => undefined);
    }

    for (const socket of open.splice(0)) {
      socket.close();
    }

    provider.sent.length = 0;
    provider.answer = () => 'delivered';
    await context().db.execute('DELETE FROM devices');
    await context().db.execute('DELETE FROM permission_requests');
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());

  const context = (): PersistenceContext =>
    harness.app.get<PersistenceContext>(PERSISTENCE_CONTEXT);

  /** An approved device with a push token, registered over HTTP exactly as the app does. */
  async function approvedDevice(installId: string, pushToken: string | null): Promise<string> {
    const token = await identity.accessToken({ subject: SUBJECT });
    const registered = await http()
      .post('/devices')
      .set('authorization', `Bearer ${token}`)
      .send({
        installId,
        name: installId,
        platform: 'android',
        appVersion: '1.0.0',
        ...(pushToken === null ? {} : { pushToken }),
      });

    await http()
      .post(`/devices/${String(registered.body.id)}/approval`)
      .set('authorization', `Bearer ${token}`)
      .send({});

    return String(registered.body.id);
  }

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
    await socket.next();

    return socket;
  }

  /**
   * What went out about **this** session.
   *
   * The provider is one object for the whole suite and the scripted run keeps going until its
   * session is closed, so a bare `provider.sent` is a shared counter: the previous scenario's
   * second question lands in the next scenario's assertion. Scoping by session is what makes each
   * case about its own.
   */
  const sentFor = (sessionId: string): PushMessage[] =>
    provider.sent.filter((message) => message.reference.sessionId === sessionId);

  async function until(socket: TestSocket, type: string, limit = 400): Promise<Envelope> {
    const seen: string[] = [];

    for (let taken = 0; taken < limit; taken += 1) {
      const frame = await socket.next();
      seen.push(frame.type);

      if (frame.type === type) {
        return frame;
      }
    }

    throw new Error(`no ${type} in: ${seen.join(', ')}`);
  }

  /**
   * Opens a session and prompts it, then **stops watching** before the question is asked.
   *
   * Detaching is the whole point: the push exists for whoever is not looking, and a suite that
   * left the socket attached would be testing the branch that sends nothing.
   */
  async function askedWithNobodyWatching(): Promise<Asked> {
    const socket = await connect();
    socket.send(commandFrame('session.start', { workspacePath: root }));
    await socket.next();

    const sessionId = String((await until(socket, 'session.started')).payload?.['sessionId']);
    started.push({ socket, sessionId });

    socket.send(commandFrame('session.detach', { sessionId }));
    await socket.next();

    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));

    const sent = await waitFor(
      'the question to reach a device',
      () => Promise.resolve(sentFor(sessionId)),
      (messages) => messages.length > 0,
    );

    return { socket, sessionId, requestId: String(sent[0]?.reference.requestId) };
  }

  /**
   * Comes back to the session, the way somebody who walked away does.
   *
   * Answering requires watching — that is the `PERMISSION_NOT_OWNED` rule of the plan before this
   * one — so a test that detached to make the push happen has to attach again to answer.
   */
  async function watchAgain(asked: Asked): Promise<void> {
    asked.socket.send(commandFrame('session.attach', { sessionId: asked.sessionId }));
    await until(asked.socket, 'session.attached');
  }

  // S-15
  it('sends when nobody is watching that session — S-15', async () => {
    await approvedDevice('install-1', 'token-one');

    const asked = await askedWithNobodyWatching();

    expect(sentFor(asked.sessionId).map((message) => message.kind)).toEqual([
      'permissionRequested',
    ]);
    expect(sentFor(asked.sessionId)[0]?.target.token).toBe('token-one');
  });

  // S-16
  it('sends nothing while a socket is attached to that session — S-16', async () => {
    await approvedDevice('install-1', 'token-one');

    const socket = await connect();
    socket.send(commandFrame('session.start', { workspacePath: root }));
    await socket.next();
    const sessionId = String((await until(socket, 'session.started')).payload?.['sessionId']);
    started.push({ socket, sessionId });

    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));
    await until(socket, 'permission.requested');

    expect(sentFor(sessionId)).toEqual([]);
  });

  // S-17: the payload goes out rendered, in the language the device registered.
  it('renders the payload in the language of the device — S-17', async () => {
    await approvedDevice('install-1', 'token-one');

    const asked = await askedWithNobodyWatching();

    expect(sentFor(asked.sessionId)[0]?.target.locale.value).toBe('en');
  });

  // S-25
  it('reaches every approved device of the user — S-25', async () => {
    await approvedDevice('install-1', 'token-one');
    await approvedDevice('install-2', 'token-two');

    const asked = await askedWithNobodyWatching();

    const tokens = await waitFor(
      'both devices to be reached',
      () => Promise.resolve(sentFor(asked.sessionId).map((message) => message.target.token)),
      (sent) => sent.length === 2,
    );

    expect([...tokens].sort()).toEqual(['token-one', 'token-two']);
  });

  it('skips a device with no token, and still reaches the one that has one', async () => {
    await approvedDevice('install-1', null);
    await approvedDevice('install-2', 'token-two');

    const asked = await askedWithNobodyWatching();

    expect(sentFor(asked.sessionId).map((message) => message.target.token)).toEqual(['token-two']);
  });

  it('sends nothing to a device nobody approved', async () => {
    const token = await identity.accessToken({ subject: SUBJECT });
    await http().post('/devices').set('authorization', `Bearer ${token}`).send({
      installId: 'install-1',
      name: 'Waiting',
      platform: 'android',
      appVersion: '1.0.0',
      pushToken: 'token-one',
    });

    const socket = await connect();
    socket.send(commandFrame('session.start', { workspacePath: root }));
    await socket.next();
    const sessionId = String((await until(socket, 'session.started')).payload?.['sessionId']);
    started.push({ socket, sessionId });
    socket.send(commandFrame('session.detach', { sessionId }));
    await socket.next();
    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));

    // The question has to have been asked before "nothing was sent" means anything. The row is
    // written before anybody is told, so it is the fact to wait on.
    await waitFor(
      'the question to be recorded',
      async () =>
        (
          await context().db.execute(
            `SELECT id FROM permission_requests WHERE session_id = '${sessionId}'`,
          )
        ).rows.length,
      (rows) => rows > 0,
    );

    expect(sentFor(sessionId)).toEqual([]);
  });

  // S-21
  it('withdraws the notification once somebody answers — S-21', async () => {
    await approvedDevice('install-1', 'token-one');
    const asked = await askedWithNobodyWatching();
    await watchAgain(asked);
    const requestId = asked.requestId;

    asked.socket.send({
      ...commandFrame('permission.resolve', { requestId, decision: 'allow' }),
      kind: 'response',
    });

    const sent = await waitFor(
      'the notification to be withdrawn',
      () => Promise.resolve(sentFor(asked.sessionId)),
      (messages) => messages.some((message) => message.kind === 'permissionResolved'),
    );

    expect(sent.at(-1)?.tag).toBe(requestId);
  });

  // S-22: the deadline is an ending like any other.
  it('withdraws the notification when the deadline refuses — S-22', async () => {
    await approvedDevice('install-1', 'token-one');
    const asked = await askedWithNobodyWatching();

    await waitFor(
      'the deadline to withdraw the notification',
      () => Promise.resolve(sentFor(asked.sessionId).map((message) => message.kind)),
      (kinds) => kinds.includes('permissionResolved'),
      5_000,
    );
  });

  // S-23: the request is still valid in the browser, and the deadline still decides.
  it('a provider that fails does not touch the permission — S-23', async () => {
    await approvedDevice('install-1', 'token-one');
    provider.answer = () => 'failed';

    const asked = await askedWithNobodyWatching();
    await watchAgain(asked);

    asked.socket.send({
      ...commandFrame('permission.resolve', { requestId: asked.requestId, decision: 'allow' }),
      kind: 'response',
    });

    expect((await until(asked.socket, 'permission.resolved')).payload).toMatchObject({
      decision: 'allow',
    });
  });

  // S-61
  it('erases a token the provider refused, and the device stays approved — S-61', async () => {
    const deviceId = await approvedDevice('install-1', 'token-one');
    provider.answer = () => 'tokenRejected';

    await askedWithNobodyWatching();

    await waitFor(
      'the refused token to be erased',
      async () => {
        const rows = await context().db.execute(
          `SELECT push_token, status FROM devices WHERE id = '${deviceId}'`,
        );
        return rows.rows[0];
      },
      (row) => row?.['push_token'] === null,
    );

    const rows = await context().db.execute(`SELECT status FROM devices WHERE id = '${deviceId}'`);
    expect(rows.rows[0]?.['status']).toBe('approved');
  });
});
