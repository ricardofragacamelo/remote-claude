import { mkdtempSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';

/** Another person of the same installation — never sees this one's servers. */
const OTHER = 'auth|other';

/** A key file of exactly 32 random bytes, base64-encoded — a valid MCP secret key (plan 13, D-02). */
function writeKeyFile(): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'rc-mcp-key-')), 'key');
  writeFileSync(file, randomBytes(32).toString('base64'), 'utf8');
  return file;
}

const STDIO_BODY = {
  name: 'github',
  scope: 'user',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', 'server-github'],
  env: [{ name: 'GITHUB_TOKEN', value: 'super-secret-token' }],
};

/**
 * `/engines/:engine/mcp-servers…` — the store of MCP servers, through the real application, over a
 * real PostgreSQL (plan 13, B-19). No engine query runs: every route here is pure store CRUD.
 */
describe('the MCP server store over HTTP — plan 13, B-19', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let token: string;
  let other: string;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    harness = await startTestApp(database.url, identity, undefined, undefined, {
      RC_MCP_SECRET_KEY_FILE: writeKeyFile(),
    });
    token = await identity.accessToken({ subject: SUBJECT });
    other = await identity.accessToken({ subject: OTHER });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  beforeEach(async () => {
    await harness.app
      .get<PersistenceContext>(PERSISTENCE_CONTEXT)
      .db.execute('DELETE FROM mcp_servers');
    harness.log.lines.length = 0;
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());
  const asAuth = (req: request.Test, as = token): request.Test =>
    req.set('authorization', `Bearer ${as}`);
  const get = (route: string, as = token) => asAuth(http().get(route), as);
  const post = (route: string, body: object, as = token) =>
    asAuth(http().post(route), as).send(body);
  const put = (route: string, body: object, as = token) => asAuth(http().put(route), as).send(body);
  const patch = (route: string, body: object, as = token) =>
    asAuth(http().patch(route), as).send(body);
  const del = (route: string, as = token) => asAuth(http().delete(route), as);

  it('refuses every route without a valid credential', async () => {
    expect((await http().get('/engines/claude/mcp-servers')).status).toBe(401);
    expect((await http().post('/engines/claude/mcp-servers').send(STDIO_BODY)).status).toBe(401);
  });

  it('answers 404 for an engine without the mcp capability', async () => {
    expect((await get('/engines/codex/mcp-servers')).status).toBe(404);
    expect((await post('/engines/codex/mcp-servers', STDIO_BODY)).status).toBe(404);
  });

  it('lists nothing for a fresh user', async () => {
    const response = await get('/engines/claude/mcp-servers');
    expect(response.status).toBe(200);
    expect(response.body.servers).toEqual([]);
  });

  it('previews a config without storing anything — S-131, S-68', async () => {
    const response = await post('/engines/claude/mcp-servers/preview', STDIO_BODY);

    expect(response.status).toBe(200);
    expect(response.body.messageKey).toBe('mcp.description.stdioAnyFolder');
    expect(response.body.params.envNames).toBe('GITHUB_TOKEN');
    expect(JSON.stringify(response.body)).not.toContain('super-secret-token');
    expect((await get('/engines/claude/mcp-servers')).body.servers).toEqual([]);
  });

  it('rejects an invalid config with the domain code — S-64', async () => {
    const response = await post('/engines/claude/mcp-servers', { ...STDIO_BODY, name: 'bad name' });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('MCP_SERVER_CONFIG_INVALID');
  });

  it('lists every invalid field of a malformed body — S-42 equivalent', async () => {
    const response = await post('/engines/claude/mcp-servers', { transport: 'carrier-pigeon' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_INPUT');
  });

  it('creates a server, never echoing the secret, and audits it — S-69, S-70, S-79', async () => {
    const created = await post('/engines/claude/mcp-servers', STDIO_BODY);

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'github',
      envNames: ['GITHUB_TOKEN'],
      enabled: true,
    });
    expect(JSON.stringify(created.body)).not.toContain('super-secret-token');

    const listed = await get('/engines/claude/mcp-servers');
    expect(listed.body.servers).toHaveLength(1);

    const events = await harness.app
      .get<PersistenceContext>(PERSISTENCE_CONTEXT)
      .db.execute(`SELECT kind FROM audit_events WHERE kind = 'mcp.serverAdded'`);
    expect(events.rows.length).toBeGreaterThan(0);
  });

  it('creates a remote (http) server, scoped to a folder', async () => {
    const created = await post('/engines/claude/mcp-servers', {
      name: 'metrics',
      scope: 'folder',
      folderPath: '/workspace/project',
      transport: 'http',
      url: 'https://mcp.example.com',
      headers: [{ name: 'Authorization', value: 'Bearer super-secret-token' }],
    });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      transport: 'http',
      url: 'https://mcp.example.com',
      folderPath: '/workspace/project',
      headerNames: ['Authorization'],
    });
    expect(JSON.stringify(created.body)).not.toContain('super-secret-token');
  });

  it('creates a remote (sse) server with no folder at all — applies to every session', async () => {
    const created = await post('/engines/claude/mcp-servers', {
      name: 'metrics-everywhere',
      scope: 'user',
      transport: 'sse',
      url: 'https://mcp.example.com',
    });

    expect(created.status).toBe(201);
    expect(created.body.folderPath).toBeNull();
  });

  it('refuses a second server with the same name in the same scope — S-69', async () => {
    await post('/engines/claude/mcp-servers', STDIO_BODY);
    const second = await post('/engines/claude/mcp-servers', STDIO_BODY);

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('MCP_SERVER_NAME_TAKEN');
  });

  it('updates a server, keeping the secret when the update omits it — S-71', async () => {
    const created = await post('/engines/claude/mcp-servers', STDIO_BODY);

    const updated = await put(`/engines/claude/mcp-servers/${String(created.body.id)}`, {
      ...STDIO_BODY,
      args: ['-y', 'server-github', '--verbose'],
      env: [{ name: 'GITHUB_TOKEN' }],
    });

    expect(updated.status).toBe(200);
    expect(updated.body.args).toEqual(['-y', 'server-github', '--verbose']);
    expect(updated.body.envNames).toEqual(['GITHUB_TOKEN']);
  });

  it('toggles a server off and on — S-92', async () => {
    const created = await post('/engines/claude/mcp-servers', STDIO_BODY);
    const id = String(created.body.id);

    const off = await patch(`/engines/claude/mcp-servers/${id}`, { enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.enabled).toBe(false);
    expect(off.body.status).toBe('disabled');

    const on = await patch(`/engines/claude/mcp-servers/${id}`, { enabled: true });
    expect(on.status).toBe(200);
    expect(on.body.enabled).toBe(true);
    expect(on.body.status).toBe('pending');
  });

  it('a server with no live session shows pending; a disabled one shows disabled — S-131, D-45', async () => {
    const created = await post('/engines/claude/mcp-servers', STDIO_BODY);
    expect(created.body.status).toBe('pending');

    await patch(`/engines/claude/mcp-servers/${String(created.body.id)}`, { enabled: false });
    const listed = await get('/engines/claude/mcp-servers');
    expect(listed.body.servers[0]?.status).toBe('disabled');
  });

  it('removes a server for good — 204, then gone from the list — S-78', async () => {
    const created = await post('/engines/claude/mcp-servers', STDIO_BODY);
    const id = String(created.body.id);

    const removed = await del(`/engines/claude/mcp-servers/${id}`);
    expect(removed.status).toBe(204);
    expect((await get('/engines/claude/mcp-servers')).body.servers).toEqual([]);

    const again = await del(`/engines/claude/mcp-servers/${id}`);
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe('MCP_SERVER_NOT_FOUND');
  });

  it('refuses reading, changing or removing somebody else’s server — S-76', async () => {
    const created = await post('/engines/claude/mcp-servers', STDIO_BODY);
    const id = String(created.body.id);

    expect((await put(`/engines/claude/mcp-servers/${id}`, STDIO_BODY, other)).status).toBe(403);
    expect(
      (await patch(`/engines/claude/mcp-servers/${id}`, { enabled: false }, other)).status,
    ).toBe(403);
    expect((await del(`/engines/claude/mcp-servers/${id}`, other)).status).toBe(403);
    expect((await get('/engines/claude/mcp-servers', other)).body.servers).toEqual([]);
  });

  it('answers 503 and stores nothing when the config carries a secret and the key file is unusable — S-73', async () => {
    const broken = await startTestApp(database.url, identity, undefined, undefined, {
      RC_MCP_SECRET_KEY_FILE: path.join(tmpdir(), 'rc-mcp-key-missing-http', 'key'),
    });

    try {
      const response = await request(broken.app.getHttpServer())
        .post('/engines/claude/mcp-servers')
        .set('authorization', `Bearer ${token}`)
        .send(STDIO_BODY);

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    } finally {
      await broken.close();
    }
  });
});
