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

/** `ScriptOptions`, with every field writable — this file flips one after a session already started. */
type MutableScript = { -readonly [K in keyof ScriptOptions]: ScriptOptions[K] };

/**
 * The two commands of a live session's MCP servers — `session.toggleMcpServer` and
 * `session.reconnectMcpServer` — over a real socket, and the `session.mcpStatusChanged` event each
 * one causes (plan 13, B-22).
 *
 * `script` is handed to {@link scriptedSdk} **by reference**, not spread into a copy: a `ScriptedQuery`
 * keeps the exact object and reads it again on every call, so a test can flip `script.mcpFails`
 * *after* a session already started and still have it apply to that same session's next control
 * request — the only way to prove a command that used to work now fails, without a second session.
 */
describe('the MCP commands of a live session — plan 13, B-22', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let root: string;
  let token: string;
  let script: MutableScript;
  let record: ScriptRecord;
  const sockets: TestSocket[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    const allowlist = writeTestAllowlist([SUBJECT]);
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

  const post = (route: string, body: object) =>
    request(harness.app.getHttpServer())
      .post(route)
      .set('authorization', `Bearer ${token}`)
      .send(body);

  const get = (route: string) =>
    request(harness.app.getHttpServer()).get(route).set('authorization', `Bearer ${token}`);

  /** An enabled, user-scope stdio server named [name], in the store, for this test's own user. */
  async function withStoredServer(name: string): Promise<void> {
    const created = await post('/engines/claude/mcp-servers', {
      name,
      scope: 'user',
      transport: 'stdio',
      command: 'npx',
    });
    expect(created.status).toBe(201);
  }

  it('toggles a server off and back on, each with an ack first and a fresh event after — S-88', async () => {
    await withStoredServer('docs');
    const socket = await connect();
    const sessionId = await started(socket);
    // The composition's own first publish, from the start itself, already went by while `started()`
    // was still scanning for `session.started` — the next one is the toggle's.

    const off = commandFrame('session.toggleMcpServer', {
      sessionId,
      name: 'docs',
      enabled: false,
    });
    socket.send(off);
    const ack = await until(socket, (frame) => frame.correlationId === off['id']);
    expect(ack.kind).toBe('ack');
    const offEvent = await until(socket, ofType('session.mcpStatusChanged'));
    expect(offEvent.seq).toEqual(expect.any(Number));
    expect(offEvent.payload?.['servers']).toEqual([
      { name: 'docs', status: 'disabled', source: 'ours', toolCount: expect.any(Number) },
    ]);

    const on = commandFrame('session.toggleMcpServer', { sessionId, name: 'docs', enabled: true });
    socket.send(on);
    await until(socket, (frame) => frame.correlationId === on['id']);
    const onEvent = await until(socket, ofType('session.mcpStatusChanged'));
    expect(onEvent.payload?.['servers']).toEqual([
      { name: 'docs', status: 'connected', source: 'ours', toolCount: expect.any(Number) },
    ]);
  });

  it('reconnects a server, with an ack first and the fresh status after — S-88', async () => {
    await withStoredServer('docs');
    const socket = await connect();
    const sessionId = await started(socket);

    const reconnect = commandFrame('session.reconnectMcpServer', { sessionId, name: 'docs' });
    socket.send(reconnect);
    const ack = await until(socket, (frame) => frame.correlationId === reconnect['id']);
    expect(ack.kind).toBe('ack');
    const event = await until(socket, ofType('session.mcpStatusChanged'));
    expect(event.payload?.['servers']).toEqual([
      { name: 'docs', status: 'connected', source: 'ours', toolCount: expect.any(Number) },
    ]);
    expect(record.mcpCommands).toEqual(['reconnect docs']);
  });

  it('acks turning on what is already on, with no second event and no engine call — S-92', async () => {
    await withStoredServer('docs');
    const socket = await connect();
    const sessionId = await started(socket);

    const on = commandFrame('session.toggleMcpServer', { sessionId, name: 'docs', enabled: true });
    socket.send(on);
    const ack = await until(socket, (frame) => frame.correlationId === on['id']);
    expect(ack.kind).toBe('ack');
    expect(record.mcpCommands).toEqual([]);

    // Something else happens next, so "no second event" is not just "nothing arrived in time".
    socket.send(commandFrame('session.interrupt', { sessionId }));
    const next = await until(socket, (frame) => frame.kind !== undefined);
    expect(next.type).not.toBe('session.mcpStatusChanged');
  });

  it('refuses a server this session does not have — S-90', async () => {
    const socket = await connect();
    const sessionId = await started(socket);

    const toggle = commandFrame('session.toggleMcpServer', {
      sessionId,
      name: 'ghost',
      enabled: true,
    });
    socket.send(toggle);
    const refusal = await until(socket, (frame) => frame.correlationId === toggle['id']);

    expect(refusal.kind).toBe('error');
    expect(refusal.payload).toMatchObject({ code: 'MCP_SERVER_NOT_FOUND' });
  });

  it('refuses a session of somebody else, and a session that does not exist — S-89', async () => {
    await withStoredServer('docs');
    const socket = await connect();
    const sessionId = await started(socket);
    const other = await identity.accessToken({ subject: 'auth|stranger' });
    const otherSocket = await TestSocket.open(harness.url);
    sockets.push(otherSocket);
    otherSocket.send(
      commandFrame('connection.authenticate', {
        token: other,
        locale: 'en',
        client: { kind: 'web', version: '0.0.0' },
      }),
    );
    await otherSocket.next();

    const stolen = commandFrame('session.reconnectMcpServer', { sessionId, name: 'docs' });
    otherSocket.send(stolen);
    const forbidden = await until(otherSocket, (frame) => frame.correlationId === stolen['id']);
    expect(forbidden.payload).toMatchObject({ code: 'FORBIDDEN' });

    const nowhere = commandFrame('session.reconnectMcpServer', {
      sessionId: '01J0AAAAAAAAAAAAAAAAAAAAZZ',
      name: 'docs',
    });
    socket.send(nowhere);
    const missing = await until(socket, (frame) => frame.correlationId === nowhere['id']);
    expect(missing.payload).toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  it('lets a failure of the engine itself through as AGENT_UNAVAILABLE — S-91', async () => {
    await withStoredServer('docs');
    const socket = await connect();
    const sessionId = await started(socket);

    // Set only now: the session above started with this unset, and composed its servers fine —
    // this is the engine failing a *later* request, not the start itself.
    script.mcpFails = new Error('cli gone');

    const toggle = commandFrame('session.toggleMcpServer', {
      sessionId,
      name: 'docs',
      enabled: false,
    });
    socket.send(toggle);
    const refusal = await until(socket, (frame) => frame.correlationId === toggle['id']);

    expect(refusal.kind).toBe('error');
    expect(refusal.payload).toMatchObject({
      code: 'AGENT_UNAVAILABLE',
      params: { engine: 'claude' },
    });
  });

  it('shows needs-auth with no OAuth address anywhere in the status — S-94', async () => {
    script.mcpServers = [{ name: 'figma', status: 'needs-auth', source: 'plugin' }];
    const socket = await connect();
    const sessionId = await started(socket);

    // The read path, not the event: the event the start itself caused already went by while
    // `started()` scanned for `session.started` (same race every other test here works around).
    const read = await get(`/sessions/${sessionId}/mcp-servers`);

    expect(read.status).toBe(200);
    expect(read.body.servers).toContainEqual({
      name: 'figma',
      status: 'needs-auth',
      source: 'plugin',
      toolCount: 0,
    });
    expect(JSON.stringify(read.body)).not.toMatch(/https?:\/\//);
  });

  it('a missed event is no loss: the client rereads by HTTP and finds the same, coherent status — S-95', async () => {
    await withStoredServer('docs');
    const socket = await connect();
    const sessionId = await started(socket);

    const off = commandFrame('session.toggleMcpServer', {
      sessionId,
      name: 'docs',
      enabled: false,
    });
    socket.send(off);
    await until(socket, (frame) => frame.correlationId === off['id']);
    // Not read here — as if this client had missed the `session.mcpStatusChanged` it caused.

    const read = await get(`/sessions/${sessionId}/mcp-servers`);
    expect(read.status).toBe(200);
    expect(read.body).toEqual({
      servers: [
        { name: 'docs', status: 'disabled', source: 'ours', toolCount: expect.any(Number) },
      ],
    });
  });
});
