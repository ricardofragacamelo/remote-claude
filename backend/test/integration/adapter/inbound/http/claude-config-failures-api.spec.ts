import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { MODEL_CHECK_SETTINGS } from '@adapter/outbound/claude/model-check.adapter';
import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import type { QueryFactory } from '@adapter/outbound/claude/query.factory';
import { SessionRegistry } from '@application/session';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { RecordAuditEventUseCase } from '@application/audit';
import { loadInitialization } from '../../../../fakes/agent-sdk/fixture';
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
 * `/claude/*` of plan 13, F1, when the installation is not well: a CLI that fails, never answers, is
 * not signed in or offers fewer models, a capacity that is full and a trail that cannot take an event
 * — through the real application, with the Agent SDK scripted per test.
 */
describe('the configuration of Claude when the installation is not well — plan 13, F1', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let root: string;
  let token: string;
  let script: ScriptOptions;
  const records: ScriptRecord[] = [];
  let folders = 0;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;

    // A fresh scripted CLI per query, following whatever the current test asked it to be.
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

  beforeEach(async () => {
    script = { fixture: 'text-turn' };
    records.length = 0;
    await harness.app
      .get<PersistenceContext>(PERSISTENCE_CONTEXT)
      .db.execute('DELETE FROM claude_defaults');
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
  const put = (route: string, body: object) =>
    http().put(route).set('authorization', `Bearer ${token}`).send(body);

  /** A folder nobody asked about yet: its answer is not in the catalogue, so a probe has to run. */
  const freshFolder = (): string => {
    folders += 1;
    const folder = path.join(root, `fresh-${String(folders)}`);
    mkdirSync(folder, { recursive: true });
    return folder;
  };
  const modelsOf = (folder: string) => get(`/claude/models?folder=${encodeURIComponent(folder)}`);
  const closes = (): number => records.reduce((total, record) => total + record.closes, 0);

  it('answers a probe that failed with CLAUDE_UNAVAILABLE, keeps nothing, and asks again — S-20, S-17', async () => {
    const folder = freshFolder();
    script = { fixture: 'text-turn', installationFails: new Error('the CLI is unhappy') };

    const failed = await modelsOf(folder);
    expect(failed.status).toBe(502);
    expect(failed.body.error.code).toBe('CLAUDE_UNAVAILABLE');
    expect(closes()).toBe(1);

    script = { fixture: 'text-turn' };
    expect((await modelsOf(folder)).status).toBe(200);
    expect(records).toHaveLength(2);
    expect(closes()).toBe(2);
  });

  it('answers a probe that never answers with CLAUDE_TIMEOUT, and ends its subprocess — S-20', async () => {
    script = { fixture: 'text-turn', installationFails: 'hang' };

    const response = await modelsOf(freshFolder());

    expect(response.status).toBe(504);
    expect(response.body.error.code).toBe('CLAUDE_TIMEOUT');
    expect(closes()).toBe(1);
  }, 20_000);

  it('refuses the probe with the capacity full, and spawns nothing — S-21', async () => {
    const registry = harness.app.get(SessionRegistry);
    let taken = 0;
    try {
      for (;;) {
        registry.reserve();
        taken += 1;
      }
    } catch {
      // Full: every slot is held by this test.
    }

    try {
      const response = await modelsOf(freshFolder());

      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe('SESSION_LIMIT_REACHED');
      expect(records).toHaveLength(0);
    } finally {
      for (; taken > 0; taken -= 1) registry.release();
    }
  });

  it('says a CLI nobody signed in to is a state, with nothing failed — S-25', async () => {
    script = { fixture: 'text-turn', initialization: { account: {} } };

    const response = await get('/claude/account?refresh=true');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ state: 'loginRequired', email: null });
  });

  it('follows the installation: a model fewer is a model fewer — S-35 — and none is an empty list — S-36', async () => {
    const recorded = loadInitialization().initialization.models;
    script = { fixture: 'text-turn', initialization: { models: recorded.slice(1) } };

    const fewer = await modelsOf(freshFolder());
    expect(fewer.body.models.map((model: { value: string }) => model.value)).toEqual(
      recorded.slice(1).map((model) => model.value),
    );

    script = { fixture: 'text-turn', initialization: { models: [] } };
    const none = await modelsOf(freshFolder());
    expect(none.status).toBe(200);
    expect(none.body.models).toEqual([]);
  });

  it('refuses to save a model unchecked when the catalogue does not answer — S-47', async () => {
    script = { fixture: 'text-turn', installationFails: new Error('the CLI is unhappy') };

    const response = await put('/claude/defaults/folder', {
      folder: freshFolder(),
      model: 'sonnet',
    });

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('CLAUDE_UNAVAILABLE');
    expect((await get('/claude/defaults')).body.user.model).toBeNull();
  });

  it('saves no default when the trail cannot take its event — S-44', async () => {
    const trail = harness.app.get(RecordAuditEventUseCase);
    const execute = trail.execute.bind(trail);
    trail.execute = () => Promise.reject(new Error('the trail is down'));

    try {
      const response = await put('/claude/defaults', { thinking: 'off' });

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
    } finally {
      trail.execute = execute;
    }
    expect((await get('/claude/defaults')).body.user.thinking).toBeNull();
  });

  it('answers a CLI that died during the test with CLAUDE_UNAVAILABLE — S-31', async () => {
    script = { fixture: 'text-turn', failWith: new Error('the subprocess exited') };

    const response = await post('/claude/diagnostics/model-check', {});

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('CLAUDE_UNAVAILABLE');
    expect((await get('/claude/installation')).body.lastModelCheck).toBeNull();
  });

  it('ends a test that does not finish in time — S-32', async () => {
    script = { fixture: 'text-turn', silent: true };

    const response = await post('/claude/diagnostics/model-check', { model: 'sonnet' });

    expect(response.status).toBe(504);
    expect(response.body.error.code).toBe('CLAUDE_TIMEOUT');
    expect(closes()).toBe(1);
  });
});
