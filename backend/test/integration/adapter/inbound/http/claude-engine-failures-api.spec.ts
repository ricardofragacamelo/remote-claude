import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { MODEL_CHECK_SETTINGS } from '@adapter/outbound/engines/claude/model-check.adapter';
import { QUERY_FACTORY } from '@adapter/outbound/engines/claude/query.factory';
import type { QueryFactory } from '@adapter/outbound/engines/claude/query.factory';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import type { ScriptOptions, ScriptRecord } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';

/** How long the test of the connection gets here — short, so a CLI that never answers is quick to see. */
const CHECK_DEADLINE_MS = 300;

/**
 * `/engines/claude/account`, `/engines/claude/diagnostics/model-check` when the installation is not
 * well (plan 28, B-36): not signed in, a CLI that dies or never answers during the test of the
 * connection — through the real application, with the Agent SDK scripted per test.
 */
describe('the account and the test of the connection when the installation is not well — plan 28, B-36', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let token: string;
  let script: ScriptOptions;
  const records: ScriptRecord[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    const allowlist = writeTestAllowlist([SUBJECT]);

    const createQuery: QueryFactory = (params) => {
      const scripted = scriptedSdk(script);
      records.push(scripted.record);
      return scripted.createQuery(params);
    };

    harness = await startTestApp(
      database.url,
      identity,
      (builder) =>
        builder
          .overrideProvider(QUERY_FACTORY)
          .useValue(createQuery)
          .overrideProvider(MODEL_CHECK_SETTINGS)
          .useValue({
            maxBudgetUsd: 0.05,
            cwd: mkdtempSync(path.join(tmpdir(), 'rc-model-check-')),
            timeoutMs: CHECK_DEADLINE_MS,
          }),
      allowlist,
    );
    token = await identity.accessToken({ subject: SUBJECT });
  });

  beforeEach(() => {
    script = { fixture: 'text-turn' };
    records.length = 0;
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());
  const get = (route: string) => http().get(route).set('authorization', `Bearer ${token}`);
  const post = (route: string, body: object) =>
    http().post(route).set('authorization', `Bearer ${token}`).send(body);
  const closes = (): number => records.reduce((total, record) => total + record.closes, 0);

  it('says a CLI nobody signed in to is a state, with nothing failed — S-25', async () => {
    script = { fixture: 'text-turn', initialization: { account: {} } };

    const response = await get('/engines/claude/account?refresh=true');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ state: 'loginRequired', email: null });
  });

  it('answers a CLI that died during the test with AGENT_UNAVAILABLE — S-31', async () => {
    script = { fixture: 'text-turn', failWith: new Error('the subprocess exited') };

    const response = await post('/engines/claude/diagnostics/model-check', {});

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('AGENT_UNAVAILABLE');
    expect((await get('/engines/claude/installation')).body.lastModelCheck).toBeNull();
  });

  it('ends a test that does not finish in time — S-32', async () => {
    script = { fixture: 'text-turn', silent: true };

    const response = await post('/engines/claude/diagnostics/model-check', { model: 'sonnet' });

    expect(response.status).toBe(504);
    expect(response.body.error.code).toBe('AGENT_TIMEOUT');
    expect(closes()).toBe(1);
  });
});
