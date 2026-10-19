import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/engines/claude/query.factory';
import type { QueryFactory } from '@adapter/outbound/engines/claude/query.factory';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import type { ScriptOptions, ScriptRecord } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

const STRANGER = 'auth|stranger-mcp-b23';

/**
 * The store reaching a live session on its own, with no command sent to it (plan 13, B-23): turning
 * a server off or removing it propagates to every live session of this user that has it, right away;
 * turning one on or adding one does not — it only takes effect for a session opened after (D-10).
 */
describe('the store disabling or removing a server reaching a live session unasked — plan 13, B-23', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let root: string;
  let token: string;
  let script: ScriptOptions;
  let record: ScriptRecord;
  const sockets: TestSocket[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    const allowlist = writeTestAllowlist([SUBJECT, STRANGER]);
    root = allowlist.root;
    mkdirSync(path.join(root, 'repo'), { recursive: true });

    const createQuery: QueryFactory = (params) => {
      const sdk = scriptedSdk(script);
      record = sdk.record;
      return sdk.createQuery(params);
    };

    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(createQuery),
      allowlist,
    );
    token = await identity.accessToken({ subject: SUBJECT });
  });

  beforeEach(async () => {
    script = { fixture: 'text-turn', silent: true };
    await harness.app
      .get<PersistenceContext>(PERSISTENCE_CONTEXT)
      .db.execute('DELETE FROM mcp_servers');
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) {
      socket.close();
    }
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  async function connect(subject = SUBJECT): Promise<TestSocket> {
    const socket = await TestSocket.open(harness.url);
    sockets.push(socket);
    const subjectToken = subject === SUBJECT ? token : await identity.accessToken({ subject });
    socket.send(
      commandFrame('connection.authenticate', {
        token: subjectToken,
        locale: 'en',
        client: { kind: 'web', version: '0.0.0' },
      }),
    );
    await socket.next();
    return socket;
  }

  async function until(
    socket: TestSocket,
    found: (frame: Envelope) => boolean,
    limit = 400,
  ): Promise<Envelope> {
    for (let taken = 0; taken < limit; taken += 1) {
      const frame = await socket.next();
      if (found(frame)) {
        return frame;
      }
    }
    throw new Error(`nothing matched in ${String(limit)} frames`);
  }

  const ofType = (type: string) => (frame: Envelope) => frame.type === type;

  async function started(
    socket: TestSocket,
    workspacePath = path.join(root, 'repo'),
  ): Promise<string> {
    socket.send(commandFrame('session.start', { workspacePath }));
    const frame = await until(socket, (frame) => frame.type === 'session.started');
    return String(frame.payload?.['sessionId']);
  }

  const post = (route: string, body: object, as = token) =>
    request(harness.app.getHttpServer())
      .post(route)
      .set('authorization', `Bearer ${as}`)
      .send(body);

  const patch = (route: string, body: object) =>
    request(harness.app.getHttpServer())
      .patch(route)
      .set('authorization', `Bearer ${token}`)
      .send(body);

  const del = (route: string) =>
    request(harness.app.getHttpServer()).delete(route).set('authorization', `Bearer ${token}`);

  /** An enabled, user-scope stdio server named [name], in the store, for this test's own user. */
  async function withStoredServer(name: string, as = token): Promise<string> {
    const created = await post(
      '/engines/claude/mcp-servers',
      { name, scope: 'user', transport: 'stdio', command: 'npx' },
      as,
    );
    expect(created.status).toBe(201);
    return String(created.body.id);
  }

  it('turns a server off in the open session that has it, with no command sent to it — S-97', async () => {
    const id = await withStoredServer('docs');
    const socket = await connect();
    await started(socket);
    // The start's own composition event already went by while `started()` scanned for
    // `session.started` — what follows is the store's own, unsolicited push.

    const off = await patch(`/engines/claude/mcp-servers/${id}`, { enabled: false });
    expect(off.status).toBe(200);

    const event = await until(socket, ofType('session.mcpStatusChanged'));
    expect(event.payload?.['servers']).toEqual([
      { name: 'docs', status: 'disabled', source: 'ours', toolCount: expect.any(Number) },
    ]);
    expect(record.mcpCommands).toEqual(['toggle docs false']);
  });

  it('turns a server off in the open session when it is removed for good, the same way — S-97', async () => {
    const id = await withStoredServer('docs');
    const socket = await connect();
    await started(socket);

    const removed = await del(`/engines/claude/mcp-servers/${id}`);
    expect(removed.status).toBe(204);

    const event = await until(socket, ofType('session.mcpStatusChanged'));
    expect(event.payload?.['servers']).toEqual([
      { name: 'docs', status: 'disabled', source: 'ours', toolCount: expect.any(Number) },
    ]);
  });

  it('reaches every open session of this user that has the server, not just one — S-97', async () => {
    const id = await withStoredServer('docs');
    const first = await connect();
    const second = await connect();
    await started(first);
    await started(second, path.join(root, 'repo'));

    await patch(`/engines/claude/mcp-servers/${id}`, { enabled: false });

    const firstEvent = await until(first, ofType('session.mcpStatusChanged'));
    const secondEvent = await until(second, ofType('session.mcpStatusChanged'));
    expect(firstEvent.payload?.['servers']).toEqual([
      { name: 'docs', status: 'disabled', source: 'ours', toolCount: expect.any(Number) },
    ]);
    expect(secondEvent.payload?.['servers']).toEqual(firstEvent.payload?.['servers']);
  });

  it('never reaches a session of somebody else, even with a server of the same name', async () => {
    await withStoredServer('docs', await identity.accessToken({ subject: STRANGER }));
    const id = await withStoredServer('docs');
    const theirSocket = await connect(STRANGER);
    const theirSessionId = await started(theirSocket, path.join(root, 'repo'));

    await patch(`/engines/claude/mcp-servers/${id}`, { enabled: false });

    // Something else happens on their socket next, so "nothing arrived" is not just a race.
    theirSocket.send(commandFrame('session.interrupt', { sessionId: theirSessionId }));
    const next = await until(theirSocket, (frame) => frame.kind !== undefined);
    expect(next.type).not.toBe('session.mcpStatusChanged');
  });

  it('does not reach the open session when the server is only enabled, or only added — S-98', async () => {
    const id = await withStoredServer('docs');
    await patch(`/engines/claude/mcp-servers/${id}`, { enabled: false });
    const socket = await connect();
    const sessionId = await started(socket);
    // The start itself composed with `docs` disabled — nothing of it is live in this session.

    const on = await patch(`/engines/claude/mcp-servers/${id}`, { enabled: true });
    expect(on.status).toBe(200);

    await post('/engines/claude/mcp-servers', {
      name: 'extra',
      scope: 'user',
      transport: 'stdio',
      command: 'npx',
    });

    // Something else happens next, so "nothing arrived" is not just "nothing arrived yet".
    socket.send(commandFrame('session.interrupt', { sessionId }));
    const next = await until(socket, (frame) => frame.kind !== undefined);
    expect(next.type).not.toBe('session.mcpStatusChanged');
    expect(record.mcpCommands).toEqual([]);
  });

  it('removing a server mid-turn still reaches the session, and the turn finishes on its own — S-99', async () => {
    const id = await withStoredServer('docs');
    // `silent` (the default of this file) never opens a turn at all — this one needs a real,
    // held one, so it replaces it just for this session.
    script = { fixture: 'text-turn' };
    const socket = await connect();
    const sessionId = await started(socket);

    socket.send(commandFrame('session.prompt', { sessionId, text: '[hold] a long one' }));
    await until(socket, (frame) => frame.payload?.['status'] === 'thinking');

    const removed = await del(`/engines/claude/mcp-servers/${id}`);
    expect(removed.status).toBe(204);

    const event = await until(socket, ofType('session.mcpStatusChanged'));
    expect(event.payload?.['servers']).toEqual([
      { name: 'docs', status: 'disabled', source: 'ours', toolCount: expect.any(Number) },
    ]);

    // The held turn is still there, unaffected — the removal did not block or drop it.
    socket.send(commandFrame('session.interrupt', { sessionId }));
    await until(socket, ofType('turn.completed'), 1_000);
    expect(record.turns).toEqual(['[hold] a long one']);
  });
});
