import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { loadInitialization } from '../../../../fakes/agent-sdk/fixture';
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
 * A session opens with the defaults of its owner and of its folder (plan 13, B-15) — over a real
 * socket, with the recorded SDK, so what is asserted is what the SDK was told.
 */
describe('the defaults reach a new session — plan 13, B-15', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let record: ScriptRecord;
  let root: string;
  let token: string;
  const sockets: TestSocket[] = [];
  const started: { socket: TestSocket; sessionId: string }[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;
    mkdirSync(path.join(root, 'repo'), { recursive: true });
    const scripted = scriptedSdk({ fixture: 'text-turn', silent: true });
    record = scripted.record;
    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery),
      allowlist,
    );
    token = await identity.accessToken({ subject: SUBJECT });
  });

  beforeEach(async () => {
    await harness.app
      .get<PersistenceContext>(PERSISTENCE_CONTEXT)
      .db.execute('DELETE FROM claude_defaults');
  });

  afterEach(async () => {
    for (const { socket, sessionId } of started.splice(0)) {
      socket.send(commandFrame('session.close', { sessionId }));
      await until(socket, 'session.closed').catch(() => undefined);
    }
  });

  afterAll(async () => {
    for (const socket of sockets) socket.close();
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  async function connect(): Promise<TestSocket> {
    const socket = await TestSocket.open(harness.url);
    sockets.push(socket);
    socket.send(
      commandFrame('connection.authenticate', {
        token,
        locale: 'en',
        client: { kind: 'web', version: '0.0.0' },
      }),
    );
    await socket.next();
    return socket;
  }

  async function until(socket: TestSocket, type: string): Promise<Envelope> {
    for (let taken = 0; taken < 200; taken += 1) {
      const frame = await socket.next();
      if (frame.type === type) return frame;
      if (frame.type === 'error') throw new Error(JSON.stringify(frame.payload));
    }
    throw new Error(`no ${type}`);
  }

  async function open(payload: Record<string, unknown> = {}): Promise<Envelope> {
    const socket = await connect();
    socket.send(
      commandFrame('session.start', { workspacePath: path.join(root, 'repo'), ...payload }),
    );
    const opened = await until(socket, 'session.started');
    started.push({ socket, sessionId: String(opened.payload?.['sessionId']) });
    return opened;
  }

  const get = (route: string) =>
    request(harness.app.getHttpServer()).get(route).set('authorization', `Bearer ${token}`);
  const put = (route: string, body: object) =>
    request(harness.app.getHttpServer())
      .put(route)
      .set('authorization', `Bearer ${token}`)
      .send(body);
  const models = loadInitialization().initialization.models.map((model) => model.value);

  it('opens as before with no default at all: the installation’s model and `default` — S-49', async () => {
    const opened = await open();

    expect(opened.payload).toMatchObject({
      permissionMode: 'default',
      defaultsFrom: 'installation',
    });
    expect(record.options).not.toHaveProperty('model');
  });

  it('opens with the folder’s default over the user’s, and says where it came from — S-50', async () => {
    const [first, second] = models;
    await put('/claude/defaults', { model: first, permissionMode: 'plan', outputStyle: 'Concise' });
    await put('/claude/defaults/folder', { folder: path.join(root, 'repo'), model: second });

    const opened = await open();

    expect(opened.payload).toMatchObject({
      model: second,
      permissionMode: 'plan',
      defaultsFrom: 'folder',
      outputStyle: 'Concise',
    });
    expect(record.options).toMatchObject({
      model: second,
      permissionMode: 'plan',
      settings: { disableSkillShellExecution: true, outputStyle: 'Concise' },
    });
  });

  it('lets what the client sent win over every default — S-48', async () => {
    await put('/claude/defaults', { model: models[0], permissionMode: 'plan' });

    const opened = await open({ model: models[1], permissionMode: 'acceptEdits' });

    expect(opened.payload).toMatchObject({
      model: models[1],
      permissionMode: 'acceptEdits',
      defaultsFrom: 'client',
    });
  });

  it('opens with the installation’s model when the default one is gone, and says so — S-51', async () => {
    const repo = path.join(root, 'repo');
    // What the installation offers is known to the catalogue before the session opens.
    expect((await get(`/claude/models?folder=${encodeURIComponent(repo)}`)).status).toBe(200);
    // A default saved before an update of the CLI took its model away: saved, then aged in place.
    expect((await put('/claude/defaults', { thinking: 'on' })).status).toBe(200);
    await harness.app
      .get<PersistenceContext>(PERSISTENCE_CONTEXT)
      .db.execute(`UPDATE claude_defaults SET model = 'a-model-gone' WHERE folder_path IS NULL`);
    harness.log.lines.length = 0;

    const opened = await open();

    expect(opened.payload).toMatchObject({ defaultsFrom: 'installation' });
    expect(opened.payload?.['model']).not.toBe('a-model-gone');
    expect(record.options).not.toHaveProperty('model', 'a-model-gone');
    expect(harness.log.withOp('claude.defaults')).toEqual([
      expect.objectContaining({ stale: ['model'] }),
    ]);
  });

  it('gives the panel of a session and this screen one list of models — S-56', async () => {
    const opened = await open();
    const sessionId = String(opened.payload?.['sessionId']);

    const panel = await get(`/sessions/${sessionId}/models`);
    const screen = await get(
      `/claude/models?folder=${encodeURIComponent(path.join(root, 'repo'))}`,
    );

    expect(panel.status).toBe(200);
    expect(screen.status).toBe(200);
    const values = (body: { models: { value: string }[] }) =>
      body.models.map((model) => model.value);
    expect(values(screen.body)).toEqual(values(panel.body));
  });

  it('turns thinking off when a default says so', async () => {
    await put('/claude/defaults', { thinking: 'off' });

    await open();

    expect(record.options?.thinking).toEqual({ type: 'disabled' });
  });
});
