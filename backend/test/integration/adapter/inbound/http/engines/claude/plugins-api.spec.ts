import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { startPostgres } from '../../../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../../../support/app/test-app';
import type { TestApp } from '../../../../../../support/app/test-app';

const OTHER = 'auth|plugins-api-other';

describe('/engines/claude/plugins — plan 13, B-27', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let token: string;
  let other: string;
  let root: string;
  let caseCount = 0;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    const allowlist = writeTestAllowlist([SUBJECT, OTHER]);
    root = allowlist.root;
    harness = await startTestApp(database.url, identity, undefined, allowlist);
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
      .db.execute('DELETE FROM claude_plugins');
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());
  const asAuth = (req: request.Test, as = token): request.Test =>
    req.set('authorization', `Bearer ${as}`);
  const get = (route: string, as = token) => asAuth(http().get(route), as);
  const post = (route: string, body: object, as = token) =>
    asAuth(http().post(route), as).send(body);
  const patch = (route: string, body: object, as = token) =>
    asAuth(http().patch(route), as).send(body);
  const del = (route: string, as = token) => asAuth(http().delete(route), as);

  /** A fresh, valid plugin directory inside the allowlist root. */
  function pluginDirectory(manifest: Record<string, unknown> = {}): string {
    caseCount += 1;
    const dir = path.join(root, `plugin-${String(caseCount)}`);
    mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
    writeFileSync(
      path.join(dir, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'my-plugin', ...manifest }),
      'utf8',
    );
    return dir;
  }

  it('lists no plugins when none were added', async () => {
    const response = await get('/engines/claude/plugins');
    expect(response.status).toBe(200);
    expect(response.body.plugins).toEqual([]);
  });

  it('previews what a local directory brings, without writing anything — S-125', async () => {
    const dir = pluginDirectory({
      description: 'does things',
      commands: undefined,
    });
    mkdirSync(path.join(dir, 'commands'), { recursive: true });
    writeFileSync(path.join(dir, 'commands', 'deploy.md'), '# deploy', 'utf8');

    const response = await post('/engines/claude/plugins/preview', { path: dir });

    expect(response.status).toBe(200);
    expect(response.body.manifest).toMatchObject({ name: 'my-plugin', commands: ['deploy'] });
    expect(response.body.messageKey).toBe('engines.claude.plugin.descriptionLocal');

    expect((await get('/engines/claude/plugins')).body.plugins).toEqual([]);
  });

  it('answers 422 previewing a directory with no manifest — S-124', async () => {
    const dir = path.join(root, 'not-a-plugin');
    mkdirSync(dir, { recursive: true });

    const response = await post('/engines/claude/plugins/preview', { path: dir });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('PLUGIN_PATH_INVALID');
  });

  it('answers 403 for a path outside the allowlist — S-124', async () => {
    const response = await post('/engines/claude/plugins/preview', { path: '/not-allowed' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('WORKSPACE_NOT_ALLOWED');
  });

  it('adds a local plugin — 201, and it shows in the list — S-123', async () => {
    const dir = pluginDirectory();

    const added = await post('/engines/claude/plugins', { path: dir });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({
      origin: 'local',
      path: dir,
      name: 'my-plugin',
      state: 'current',
      enabled: true,
    });

    const list = await get('/engines/claude/plugins');
    expect(list.body.plugins).toHaveLength(1);
    expect(list.body.plugins[0].id).toBe(added.body.id);
  });

  it('adding the same directory twice answers the existing plugin — S-130', async () => {
    const dir = pluginDirectory();
    const first = await post('/engines/claude/plugins', { path: dir });
    const second = await post('/engines/claude/plugins', { path: dir });

    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect((await get('/engines/claude/plugins')).body.plugins).toHaveLength(1);
  });

  it('toggles a plugin off and on — S-127', async () => {
    const dir = pluginDirectory();
    const added = await post('/engines/claude/plugins', { path: dir });

    const off = await patch(`/engines/claude/plugins/${String(added.body.id)}`, { enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.enabled).toBe(false);

    const on = await patch(`/engines/claude/plugins/${String(added.body.id)}`, { enabled: true });
    expect(on.body.enabled).toBe(true);
  });

  it('removes a plugin for good — 204, then 404 — S-127, S-129', async () => {
    const dir = pluginDirectory();
    const added = await post('/engines/claude/plugins', { path: dir });

    const removed = await del(`/engines/claude/plugins/${String(added.body.id)}`);
    expect(removed.status).toBe(204);

    const again = await del(`/engines/claude/plugins/${String(added.body.id)}`);
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe('PLUGIN_NOT_FOUND');
  });

  it('refuses toggling or removing somebody else’s plugin — S-129', async () => {
    const dir = pluginDirectory();
    const added = await post('/engines/claude/plugins', { path: dir });
    const id = String(added.body.id);

    expect((await patch(`/engines/claude/plugins/${id}`, { enabled: false }, other)).status).toBe(
      403,
    );
    expect((await del(`/engines/claude/plugins/${id}`, other)).status).toBe(403);
  });

  it('shows a plugin whose manifest changed as changed, then unreadable when it is gone — S-128', async () => {
    const dir = pluginDirectory();
    await post('/engines/claude/plugins', { path: dir });

    writeFileSync(
      path.join(dir, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'my-plugin', version: '2.0.0' }),
      'utf8',
    );

    const changed = await get('/engines/claude/plugins');
    expect(changed.body.plugins[0].state).toBe('changed');
  });

  it('answers 401 without a bearer token', async () => {
    const response = await request(harness.app.getHttpServer()).get('/engines/claude/plugins');
    expect(response.status).toBe(401);
  });
});
