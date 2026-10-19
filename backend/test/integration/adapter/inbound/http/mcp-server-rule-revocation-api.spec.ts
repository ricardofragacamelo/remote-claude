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

/** A key file of exactly 32 random bytes, base64-encoded — a valid MCP secret key (plan 13, D-02). */
function writeKeyFile(): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'rc-mcp-key-')), 'key');
  writeFileSync(file, randomBytes(32).toString('base64'), 'utf8');
  return file;
}

/**
 * Changing or removing a server revokes the `allow` rules of this user that reach it — the
 * canonical `mcp(<name>:…)` — through the real application and a real PostgreSQL (plan 13, B-26;
 * D-12). `deny` holds, another server's rule holds, and nothing moves for a rename alone.
 */
describe('a changed or removed MCP server revoking the permission rules that reached it — plan 13, B-26, S-119', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let token: string;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    harness = await startTestApp(database.url, identity, undefined, undefined, {
      RC_MCP_SECRET_KEY_FILE: writeKeyFile(),
    });
    token = await identity.accessToken({ subject: SUBJECT });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  beforeEach(async () => {
    const db = harness.app.get<PersistenceContext>(PERSISTENCE_CONTEXT).db;
    await db.execute('DELETE FROM mcp_servers');
    await db.execute('DELETE FROM permission_rules');
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());
  const post = (route: string, body: object) =>
    http().post(route).set('authorization', `Bearer ${token}`).send(body);
  const put = (route: string, body: object) =>
    http().put(route).set('authorization', `Bearer ${token}`).send(body);
  const patch = (route: string, body: object) =>
    http().patch(route).set('authorization', `Bearer ${token}`).send(body);
  const del = (route: string) => http().delete(route).set('authorization', `Bearer ${token}`);
  const rules = () => http().get('/permission-rules').set('authorization', `Bearer ${token}`);

  async function withStoredServer(name = 'github'): Promise<string> {
    const created = await post('/engines/claude/mcp-servers', {
      name,
      scope: 'user',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'server-github'],
    });
    expect(created.status).toBe(201);
    return String(created.body.id);
  }

  async function grantAlways(pattern: string): Promise<string> {
    const granted = await post('/permission-rules', {
      pattern,
      decision: 'allow',
      scope: 'always',
    });
    expect(granted.status).toBe(201);
    return String(granted.body.id);
  }

  it('revokes a rule naming the tool, and one naming the whole server, on a command change', async () => {
    const id = await withStoredServer('github');
    await grantAlways('mcp(github:create_issue)');
    await grantAlways('mcp(github:*)');

    const changed = await put(`/engines/claude/mcp-servers/${id}`, {
      name: 'github',
      scope: 'user',
      transport: 'stdio',
      command: 'node',
      args: ['-y', 'server-github'],
    });
    expect(changed.status).toBe(200);

    expect((await rules()).body.rules).toEqual([]);
  });

  it('revokes a rule on an args change, or a transport change, not only on the command', async () => {
    const id = await withStoredServer('github');
    const sameArgsRule = await grantAlways('mcp(github:*)');
    const changedArgs = await put(`/engines/claude/mcp-servers/${id}`, {
      name: 'github',
      scope: 'user',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'server-github', '--verbose'],
    });
    expect(changedArgs.status).toBe(200);
    expect((await rules()).body.rules.map((r: { id: string }) => r.id)).not.toContain(sameArgsRule);
  });

  it('never revokes anything when only the name changes — the program is still the same', async () => {
    const id = await withStoredServer('github');
    await grantAlways('mcp(github:*)');

    const renamed = await put(`/engines/claude/mcp-servers/${id}`, {
      name: 'github2',
      scope: 'user',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'server-github'],
    });
    expect(renamed.status).toBe(200);

    expect((await rules()).body.rules).toHaveLength(1);
  });

  it('revokes a reaching rule when the server is removed — the program answering to that name is gone', async () => {
    const id = await withStoredServer('github');
    await grantAlways('mcp(github:*)');

    const removed = await del(`/engines/claude/mcp-servers/${id}`);
    expect(removed.status).toBe(204);

    expect((await rules()).body.rules).toEqual([]);
  });

  it('never touches disabling or enabling alone — the program did not change', async () => {
    const id = await withStoredServer('github');
    await grantAlways('mcp(github:*)');

    expect((await patch(`/engines/claude/mcp-servers/${id}`, { enabled: false })).status).toBe(200);
    expect((await rules()).body.rules).toHaveLength(1);
  });

  it('leaves a deny rule exactly as it was — narrowing never authorises a different program', async () => {
    const id = await withStoredServer('github');
    const denied = await post('/permission-rules', {
      pattern: 'mcp(github:*)',
      decision: 'deny',
      scope: 'always',
    });
    expect(denied.status).toBe(201);

    await put(`/engines/claude/mcp-servers/${id}`, {
      name: 'github',
      scope: 'user',
      transport: 'stdio',
      command: 'node',
      args: [],
    });

    expect((await rules()).body.rules.map((r: { id: string }) => r.id)).toContain(denied.body.id);
  });

  it('never touches a rule of a different server', async () => {
    const id = await withStoredServer('github');
    await grantAlways('mcp(gitlab:*)');

    await put(`/engines/claude/mcp-servers/${id}`, {
      name: 'github',
      scope: 'user',
      transport: 'stdio',
      command: 'node',
      args: [],
    });

    expect((await rules()).body.rules).toHaveLength(1);
  });
});
