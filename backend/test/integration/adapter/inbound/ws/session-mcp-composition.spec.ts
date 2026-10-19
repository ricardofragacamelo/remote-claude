import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
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

/** A key file of exactly 32 random bytes, base64-encoded — a valid MCP secret key (plan 13, D-02). */
function writeKeyFile(): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'rc-mcp-key-')), 'key');
  writeFileSync(file, randomBytes(32).toString('base64'), 'utf8');
  return file;
}

/**
 * A session composes its MCP servers from the store and hands them to the engine right after it
 * starts — over a real socket, with the recorded SDK, so what is asserted is exactly what
 * `setMcpServers()` was called with (plan 13, B-21).
 */
describe('a session composes its MCP servers — plan 13, B-21', () => {
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
      { RC_MCP_SECRET_KEY_FILE: writeKeyFile() },
    );
    token = await identity.accessToken({ subject: SUBJECT });
  });

  beforeEach(async () => {
    await harness.app
      .get<PersistenceContext>(PERSISTENCE_CONTEXT)
      .db.execute('DELETE FROM mcp_servers');
    record.mcpSets.length = 0;
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

  it('hands the engine a user-scope server right after the session starts, secret included', async () => {
    await post('/engines/claude/mcp-servers', {
      name: 'github',
      scope: 'user',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'server-github'],
      env: [{ name: 'GITHUB_TOKEN', value: 'composed-secret-value' }],
    });

    await open();

    expect(record.mcpSets).toHaveLength(1);
    expect(record.mcpSets[0]).toEqual({
      github: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'server-github'],
        env: { GITHUB_TOKEN: 'composed-secret-value' },
      },
    });
  });

  it('includes a folder-scope server only when the session opens inside its folder', async () => {
    const repo = path.join(root, 'repo');
    await post('/engines/claude/mcp-servers', {
      name: 'metrics',
      scope: 'folder',
      folderPath: repo,
      transport: 'http',
      url: 'https://mcp.example.com',
    });

    await open(repo);
    expect(record.mcpSets).toHaveLength(1);
    expect(Object.keys(record.mcpSets[0] ?? {})).toEqual(['metrics']);

    record.mcpSets.length = 0;
    mkdirSync(path.join(root, 'elsewhere'), { recursive: true });
    await open(path.join(root, 'elsewhere'));
    expect(record.mcpSets).toHaveLength(1);
    expect(record.mcpSets[0]).toEqual({});
  });

  it('excludes a disabled server', async () => {
    const created = await post('/engines/claude/mcp-servers', {
      name: 'github',
      scope: 'user',
      transport: 'stdio',
      command: 'npx',
    });
    await request(harness.app.getHttpServer())
      .patch(`/engines/claude/mcp-servers/${String(created.body.id)}`)
      .set('authorization', `Bearer ${token}`)
      .send({ enabled: false });

    await open();

    expect(record.mcpSets).toHaveLength(1);
    expect(record.mcpSets[0]).toEqual({});
  });

  it('opens with no servers at all when none are stored — still calls setMcpServers once, with none', async () => {
    await open();
    expect(record.mcpSets).toEqual([{}]);
  });
});
