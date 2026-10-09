import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import type { ScriptRecord } from '../../../../fakes/agent-sdk/scripted-query';
import { loadInitialization } from '../../../../fakes/agent-sdk/fixture';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';

/** Another person of the same installation, with a root of their own. */
const OTHER = 'auth|other';

/**
 * `/claude/*` of plan 13, F1 — the account, the installation, the test of the connection, the
 * models and the defaults — through the real application, over a real PostgreSQL, with the Agent
 * SDK replaced by the recorded one.
 */
describe('the configuration of Claude over HTTP — plan 13, F1', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let record: ScriptRecord;
  let root: string;
  let token: string;
  let other: string;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;
    mkdirSync(path.join(root, 'repo', 'pkg'), { recursive: true });

    const scripted = scriptedSdk({ fixture: 'text-turn' });
    record = scripted.record;
    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery),
      allowlist,
    );
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
      .db.execute('DELETE FROM claude_defaults');
    harness.log.lines.length = 0;
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());
  const get = (route: string, as = token) => http().get(route).set('authorization', `Bearer ${as}`);
  const put = (route: string, body: object, as = token) =>
    http().put(route).set('authorization', `Bearer ${as}`).send(body);
  const repo = (): string => path.join(root, 'repo');

  it('refuses every route without a valid credential — S-29', async () => {
    for (const route of [
      '/claude/account',
      '/claude/installation',
      '/claude/models',
      '/claude/defaults',
    ]) {
      expect((await http().get(route)).status, route).toBe(401);
    }
    expect((await http().post('/claude/diagnostics/model-check').send({})).status).toBe(401);
  });

  it('answers the account, never a token nor the path of a credential — S-24', async () => {
    const response = await get('/claude/account');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ state: 'ready', email: 'person@example.com' });
    expect(JSON.stringify(response.body)).not.toMatch(/credentials\.json|sk-ant/);
  });

  it('reads the account again when asked to, past the minute it is kept — S-26', async () => {
    await get('/claude/account');
    const before = record.initializationCalls;

    await get('/claude/account');
    expect(record.initializationCalls).toBe(before);

    await get('/claude/account?refresh=true');
    expect(record.initializationCalls).toBe(before + 1);
    expect((await get('/claude/account?refresh=maybe')).status).toBe(400);
  });

  it('answers the diagnostic of the installation, never a 5xx — S-27', async () => {
    const response = await get('/claude/installation');

    expect(response.status).toBe(200);
    expect(response.body.bundledCli).toEqual({ version: expect.any(String), reason: null });
    expect(response.body.pathCli).toHaveProperty('differs');
    expect(response.body.configDir).toMatchObject({ path: expect.any(String) });
  });

  it('runs the test of the connection, one turn, and the diagnostic keeps it — S-30', async () => {
    const response = await http()
      .post('/claude/diagnostics/model-check')
      .set('authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ result: 'ok', latencyMs: expect.any(Number) });
    expect((await get('/claude/installation')).body.lastModelCheck).toMatchObject({ result: 'ok' });
  });

  it('answers the models of the installation, never a list of ours — S-34', async () => {
    const response = await get(`/claude/models?folder=${encodeURIComponent(repo())}`);

    expect(response.status).toBe(200);
    expect(response.body.models.map((model: { value: string }) => model.value)).toEqual(
      loadInitialization().initialization.models.map((model) => model.value),
    );
    expect(response.body.permissionModes).toContain('plan');
  });

  it('answers the models of the user’s first root when no folder is named — S-34', async () => {
    const response = await get('/claude/models');

    expect(response.status).toBe(200);
    expect(response.body.models.length).toBeGreaterThan(0);
  });

  it('refuses the installation’s account and models to a user with no root at all — D-07', async () => {
    const rootless = await identity.accessToken({ subject: 'auth|rootless' });

    expect((await get('/claude/account', rootless)).status).toBe(403);
    expect((await get('/claude/models', rootless)).status).toBe(403);
  });

  it('refuses a folder outside the allowlist, or somebody else’s, before any probe — S-23', async () => {
    const before = record.initializationCalls;

    expect((await get('/claude/models?folder=%2Fetc')).status).toBe(403);
    expect((await get(`/claude/models?folder=${encodeURIComponent(repo())}`, other)).status).toBe(
      403,
    );
    expect(
      (await get(`/claude/models?folder=${encodeURIComponent(path.join(root, 'nope'))}`)).status,
    ).toBe(404);
    expect(record.initializationCalls).toBe(before);
  });

  it('saves the user default and answers what applies, with where it came from — S-37', async () => {
    const model = loadInitialization().initialization.models[1]?.value ?? 'default';
    const saved = await put('/claude/defaults', { model, permissionMode: 'plan' });

    expect(saved.status).toBe(200);
    expect(saved.body.effective.model).toEqual({ value: model, from: 'user' });

    const events = await harness.app
      .get<PersistenceContext>(PERSISTENCE_CONTEXT)
      .db.execute(`SELECT kind FROM audit_events WHERE kind = 'claude.defaultsChanged'`);
    expect(events.rows.length).toBeGreaterThan(0);
  });

  it('refuses a model the installation does not offer — S-39 — and bypassPermissions — S-40', async () => {
    const unknown = await put('/claude/defaults', { model: 'no-such-model' });
    const bypass = await put('/claude/defaults', { permissionMode: 'bypassPermissions' });

    expect(unknown.status).toBe(422);
    expect(unknown.body.error).toMatchObject({
      code: 'MODEL_NOT_AVAILABLE',
      params: { model: 'no-such-model' },
    });
    expect(bypass.status).toBe(422);
    expect(bypass.body.error.code).toBe('DEFAULT_MODE_NOT_ALLOWED');
  });

  it('lists every invalid field of a malformed body — S-42', async () => {
    const response = await put('/claude/defaults', { thinking: 'maybe', effort: 3, colour: 'red' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_INPUT');
    expect(response.body.error.details.length).toBeGreaterThanOrEqual(3);
  });

  it('records one event for the same default saved twice — S-43', async () => {
    const context = harness.app.get<PersistenceContext>(PERSISTENCE_CONTEXT);
    const count = async () =>
      Number(
        (
          await context.db.execute(
            `SELECT count(*) AS n FROM audit_events WHERE kind = 'claude.defaultsChanged'`,
          )
        ).rows[0]?.['n'],
      );
    const before = await count();

    await put('/claude/defaults', { thinking: 'off' });
    await put('/claude/defaults', { thinking: 'off' });

    expect((await count()) - before).toBe(1);
  });

  it('leaves one of two saves at once, whole — S-45', async () => {
    const [first, second] = await Promise.all([
      put('/claude/defaults', { thinking: 'on', permissionMode: 'plan' }),
      put('/claude/defaults', { thinking: 'off', permissionMode: 'acceptEdits' }),
    ]);
    expect([first.status, second.status]).toEqual([200, 200]);

    const user = (await get('/claude/defaults')).body.user;
    expect([
      { thinking: 'on', permissionMode: 'plan' },
      { thinking: 'off', permissionMode: 'acceptEdits' },
    ]).toContainEqual({ thinking: user.thinking, permissionMode: user.permissionMode });
  });

  it('saves a folder override that applies under it, and clears it — S-38', async () => {
    await put('/claude/defaults', { thinking: 'on' });
    expect((await put('/claude/defaults/folder', { folder: repo(), thinking: 'off' })).status).toBe(
      200,
    );

    const below = await get(
      `/claude/defaults?folder=${encodeURIComponent(path.join(repo(), 'pkg'))}`,
    );
    expect(below.body.effective.thinking).toEqual({ value: 'off', from: 'folder', folder: repo() });

    const cleared = await http()
      .delete(`/claude/defaults/folder?folder=${encodeURIComponent(repo())}`)
      .set('authorization', `Bearer ${token}`);
    expect(cleared.status).toBe(204);
    expect(
      (await get(`/claude/defaults?folder=${encodeURIComponent(repo())}`)).body.effective.thinking
        .from,
    ).toBe('user');
  });

  it('refuses the override of a folder of somebody else — S-46', async () => {
    expect(
      (await put('/claude/defaults/folder', { folder: repo(), thinking: 'on' }, other)).status,
    ).toBe(403);
    expect((await get(`/claude/defaults?folder=${encodeURIComponent(repo())}`, other)).status).toBe(
      403,
    );
  });
});
