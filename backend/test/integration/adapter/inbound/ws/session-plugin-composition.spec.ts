import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/engines/claude/query.factory';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
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
 * A session loads the local plugins the caller enabled, as `{ type: 'local', path,
 * skipMcpDiscovery: true }` — never a plugin's own MCP server on its own (plan 13, B-27; S-123,
 * S-126). The same shape `session-mcp-composition.spec.ts` already proves for B-21, over a real
 * socket, with the recorded SDK, so what is asserted is exactly what the engine's options carried.
 */
describe('a session loads its plugins — plan 13, B-27', () => {
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
    const db = harness.app.get<PersistenceContext>(PERSISTENCE_CONTEXT).db;
    await db.execute('DELETE FROM claude_plugins');
    await db.execute('DELETE FROM mcp_servers');
    record.mcpSets.length = 0;
    record.options = null;
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

  async function open(workspacePath = path.join(root, 'repo')): Promise<Envelope> {
    const socket = await connect();
    socket.send(commandFrame('session.start', { workspacePath }));
    const opened = await until(socket, 'session.started');
    started.push({ socket, sessionId: String(opened.payload?.['sessionId']) });
    return opened;
  }

  const post = (route: string, body: object) =>
    request(harness.app.getHttpServer())
      .post(route)
      .set('authorization', `Bearer ${token}`)
      .send(body);

  const patch = (route: string, body: object) =>
    request(harness.app.getHttpServer())
      .patch(route)
      .set('authorization', `Bearer ${token}`)
      .send(body);

  let caseCount = 0;

  /** A fresh plugin directory, with a manifest declaring one MCP server — never approved as ours. */
  function pluginDirectory(): string {
    caseCount += 1;
    const dir = path.join(root, `plugin-${String(caseCount)}`);
    mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
    writeFileSync(
      path.join(dir, '.claude-plugin', 'plugin.json'),
      JSON.stringify({
        name: 'my-plugin',
        mcpServers: { docs: { command: 'npx', args: ['-y', 'server-docs'] } },
      }),
      'utf8',
    );
    return dir;
  }

  it('hands the engine the enabled plugin’s directory, with MCP discovery skipped — S-123', async () => {
    const dir = pluginDirectory();
    const added = await post('/engines/claude/plugins', { path: dir });
    expect(added.status).toBe(201);

    await open();

    expect(record.options?.plugins).toEqual([{ type: 'local', path: dir, skipMcpDiscovery: true }]);
  });

  it('never composes the plugin’s own declared MCP server into the session — S-126', async () => {
    await post('/engines/claude/plugins', { path: pluginDirectory() });

    await open();

    expect(record.mcpSets).toEqual([{}]);
  });

  it('excludes a disabled plugin', async () => {
    const dir = pluginDirectory();
    const added = await post('/engines/claude/plugins', { path: dir });
    await patch(`/engines/claude/plugins/${String(added.body.id)}`, { enabled: false });

    await open();

    expect('plugins' in (record.options ?? {})).toBe(false);
  });

  it('opens with no plugins field at all when none are enabled', async () => {
    await open();
    expect('plugins' in (record.options ?? {})).toBe(false);
  });
});
