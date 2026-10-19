import { mkdtempSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { MCP_SERVER_TEST_TIMEOUT } from '@application/mcp';
import { QUERY_FACTORY } from '@adapter/outbound/engines/claude/query.factory';
import type { QueryFactory } from '@adapter/outbound/engines/claude/query.factory';
import { SessionRegistry } from '@application/session';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import type { ScriptOptions, ScriptRecord } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';

/** A key file of exactly 32 random bytes, base64-encoded — a valid MCP secret key (plan 13, D-02). */
function writeKeyFile(): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'rc-mcp-key-')), 'key');
  writeFileSync(file, randomBytes(32).toString('base64'), 'utf8');
  return file;
}

/** A short, fast deadline for the timeout scenario — this suite never waits out the real 15 s. */
const SHORT_TEST_TIMEOUT_MS = 200;

/**
 * `POST /engines/:engine/mcp-servers/:id/test` — testing a saved server's connection, for real
 * (plan 13, B-25), through the real application and a real PostgreSQL. The Agent SDK is replaced,
 * because what this proves is the probe and the capacity it takes, not a real subprocess.
 */
describe('testing an MCP server’s connection over HTTP — plan 13, B-25', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let token: string;
  let script: ScriptOptions;
  let record: ScriptRecord;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    const createQuery: QueryFactory = (params) => {
      const sdk = scriptedSdk(script);
      record = sdk.record;
      return sdk.createQuery(params);
    };

    harness = await startTestApp(
      database.url,
      identity,
      (builder) =>
        builder
          .overrideProvider(QUERY_FACTORY)
          .useValue(createQuery)
          .overrideProvider(MCP_SERVER_TEST_TIMEOUT)
          .useValue(SHORT_TEST_TIMEOUT_MS),
      undefined,
      { RC_MCP_SECRET_KEY_FILE: writeKeyFile() },
    );
    token = await identity.accessToken({ subject: SUBJECT });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  beforeEach(async () => {
    script = { fixture: 'text-turn' };
    await harness.app
      .get<PersistenceContext>(PERSISTENCE_CONTEXT)
      .db.execute('DELETE FROM mcp_servers');
    harness.log.lines.length = 0;
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());
  const post = (route: string, body: object = {}) =>
    http().post(route).set('authorization', `Bearer ${token}`).send(body);

  async function withStoredServer(): Promise<string> {
    const created = await post('/engines/claude/mcp-servers', {
      name: 'docs',
      scope: 'user',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'server'],
    });
    expect(created.status).toBe(201);
    return String(created.body.id);
  }

  it('connects, and answers the status and the tools it found — S-111', async () => {
    const id = await withStoredServer();

    const tested = await post(`/engines/claude/mcp-servers/${id}/test`);

    expect(tested.status).toBe(200);
    expect(tested.body.status).toBe('connected');
    expect(tested.body.tools.length).toBeGreaterThan(0);
    expect(tested.body.error).toBeNull();
    expect(record.mcpSets).toHaveLength(1);
    expect(Object.keys(record.mcpSets[0] ?? {})).toEqual(['docs']);
  });

  it('answers timeout as data, not an error, when the server never leaves pending — S-112', async () => {
    const id = await withStoredServer();
    script = { ...script, mcpConnectStatus: 'pending' };

    const tested = await post(`/engines/claude/mcp-servers/${id}/test`);

    expect(tested.status).toBe(200);
    expect(tested.body).toEqual({ status: 'timeout', tools: [], error: null });
  });

  it('answers needs-auth, and failed with a redacted error', async () => {
    const id = await withStoredServer();
    script = { ...script, mcpConnectStatus: 'needs-auth' };
    expect((await post(`/engines/claude/mcp-servers/${id}/test`)).body).toEqual({
      status: 'needs-auth',
      tools: [],
      error: null,
    });

    script = {
      ...script,
      mcpConnectStatus: 'failed',
      mcpConnectError: 'auth failed: Bearer sk-live-abc123',
    };
    const failed = await post(`/engines/claude/mcp-servers/${id}/test`);
    expect(failed.body.status).toBe('failed');
    expect(failed.body.error).not.toContain('sk-live-abc123');
  });

  it('records mcp.serverTested — testing executes the command — S-114', async () => {
    const id = await withStoredServer();

    await post(`/engines/claude/mcp-servers/${id}/test`);

    const events = await harness.app
      .get<PersistenceContext>(PERSISTENCE_CONTEXT)
      .db.execute(`SELECT kind FROM audit_events WHERE kind = 'mcp.serverTested'`);
    expect(events.rows.length).toBeGreaterThan(0);
  });

  it('refuses a test when the installation is already at capacity, without spawning anything — S-115', async () => {
    const id = await withStoredServer();
    const registry = harness.app.get<SessionRegistry>(SessionRegistry);
    const slots: number[] = [];
    while (registry.size < registry.capacity) {
      registry.reserve();
      slots.push(1);
    }

    // `record` may already carry sets from an earlier test in this suite — refusing without
    // spawning means this count does not move, not that it starts at zero.
    const before = record?.mcpSets.length ?? 0;

    try {
      const refused = await post(`/engines/claude/mcp-servers/${id}/test`);
      expect(refused.status).toBe(429);
      expect(refused.body.error.code).toBe('SESSION_LIMIT_REACHED');
      expect(record?.mcpSets.length ?? 0).toBe(before);
    } finally {
      slots.forEach(() => registry.release());
    }
  });

  it('refuses a server that does not exist, or belongs to somebody else', async () => {
    expect((await post('/engines/claude/mcp-servers/ghost/test')).status).toBe(404);

    const id = await withStoredServer();
    const other = await identity.accessToken({ subject: 'auth|mcp-test-stranger' });
    const stolen = await http()
      .post(`/engines/claude/mcp-servers/${id}/test`)
      .set('authorization', `Bearer ${other}`);
    expect(stolen.status).toBe(403);
  });

  it('answers 404 for an engine without the mcp capability', async () => {
    expect((await post('/engines/codex/mcp-servers/ghost/test')).status).toBe(404);
  });

  it('refuses every route without a valid credential', async () => {
    const id = await withStoredServer();
    expect((await http().post(`/engines/claude/mcp-servers/${id}/test`)).status).toBe(401);
  });

  it('lets a dead engine answer as AGENT_UNAVAILABLE, never as data', async () => {
    const id = await withStoredServer();
    script = { ...script, mcpFails: new Error('cli gone') };

    const tested = await post(`/engines/claude/mcp-servers/${id}/test`);

    expect(tested.status).toBe(502);
    expect(tested.body.error.code).toBe('AGENT_UNAVAILABLE');
  });

  it('shares one in-flight test between two requests of the same server — S-113', async () => {
    const id = await withStoredServer();

    const [first, second] = await Promise.all([
      post(`/engines/claude/mcp-servers/${id}/test`),
      post(`/engines/claude/mcp-servers/${id}/test`),
    ]);

    expect(first.body).toEqual(second.body);
    // One subprocess, not two: a second `setMcpServers()` would mean two tests actually ran.
    expect(record.mcpSets).toHaveLength(1);
  });
});
