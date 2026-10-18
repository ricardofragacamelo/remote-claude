import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

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

/**
 * `/engines/claude/account`, `/engines/claude/installation`,
 * `/engines/claude/diagnostics/model-check` — what only Claude has (plan 28, B-36, D-07), through
 * the real application, with the Agent SDK replaced by the recorded one.
 */
describe('the account and installation of Claude over HTTP — plan 28, B-36', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let record: ScriptRecord;
  let token: string;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    const allowlist = writeTestAllowlist([SUBJECT]);

    const scripted = scriptedSdk({ fixture: 'text-turn' });
    record = scripted.record;
    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery),
      allowlist,
    );
    token = await identity.accessToken({ subject: SUBJECT });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  beforeEach(async () => {
    await harness.app
      .get<PersistenceContext>(PERSISTENCE_CONTEXT)
      .db.execute('DELETE FROM agent_defaults');
    harness.log.lines.length = 0;
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());
  const get = (route: string) => http().get(route).set('authorization', `Bearer ${token}`);

  it('refuses every route without a valid credential — S-29', async () => {
    for (const route of ['/engines/claude/account', '/engines/claude/installation']) {
      expect((await http().get(route)).status, route).toBe(401);
    }
    expect((await http().post('/engines/claude/diagnostics/model-check').send({})).status).toBe(
      401,
    );
  });

  it('answers the account, never a token nor the path of a credential — S-24', async () => {
    const response = await get('/engines/claude/account');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ state: 'ready', email: 'person@example.com' });
    expect(JSON.stringify(response.body)).not.toMatch(/credentials\.json|sk-ant/);
  });

  it('reads the account again when asked to, past the minute it is kept — S-26', async () => {
    await get('/engines/claude/account');
    const before = record.initializationCalls;

    await get('/engines/claude/account');
    expect(record.initializationCalls).toBe(before);

    await get('/engines/claude/account?refresh=true');
    expect(record.initializationCalls).toBe(before + 1);
    expect((await get('/engines/claude/account?refresh=maybe')).status).toBe(400);
  });

  it('answers the diagnostic of the installation, never a 5xx — S-27', async () => {
    const response = await get('/engines/claude/installation');

    expect(response.status).toBe(200);
    expect(response.body.bundledCli).toEqual({ version: expect.any(String), reason: null });
    expect(response.body.pathCli).toHaveProperty('differs');
    expect(response.body.configDir).toMatchObject({ path: expect.any(String) });
  });

  it('runs the test of the connection, one turn, and the diagnostic keeps it — S-30', async () => {
    const response = await http()
      .post('/engines/claude/diagnostics/model-check')
      .set('authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ result: 'ok', latencyMs: expect.any(Number) });
    expect((await get('/engines/claude/installation')).body.lastModelCheck).toMatchObject({
      result: 'ok',
    });
  });

  it('refuses the installation’s account to a user with no root at all — D-07', async () => {
    const rootless = await identity.accessToken({ subject: 'auth|rootless' });

    const response = await http()
      .get('/engines/claude/account')
      .set('authorization', `Bearer ${rootless}`);

    expect(response.status).toBe(403);
  });
});
