import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { QUERY_FACTORY } from '@adapter/outbound/engines/claude/query.factory';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';

/** Another person of the same installation, with a root of their own. */
const OTHER = 'auth|other';

/**
 * `/engines/claude/output-style…` — the style Claude's sessions open with (plan 13, D-04, D-06;
 * plan 28, D-06), through the real application, over a real PostgreSQL.
 */
describe('the output style of Claude’s sessions over HTTP — plan 28, D-06', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let root: string;
  let token: string;
  let other: string;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;

    const scripted = scriptedSdk({ fixture: 'text-turn' });
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
      .db.execute('DELETE FROM claude_output_style_defaults');
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());
  const get = (route: string, as = token) => http().get(route).set('authorization', `Bearer ${as}`);
  const put = (route: string, body: object, as = token) =>
    http().put(route).set('authorization', `Bearer ${as}`).send(body);

  it('refuses every route without a valid credential', async () => {
    expect((await http().get('/engines/claude/output-style')).status).toBe(401);
  });

  it('answers nothing set by default, and where the style applies once it is', async () => {
    const empty = await get('/engines/claude/output-style');
    expect(empty.status).toBe(200);
    expect(empty.body.effective).toEqual({ value: null, from: 'installation' });

    const saved = await put('/engines/claude/output-style', { outputStyle: 'Concise' });
    expect(saved.status).toBe(200);
    expect(saved.body.effective).toEqual({ value: 'Concise', from: 'user' });
    expect(saved.body.user).toBe('Concise');
  });

  it('saves a folder override that applies under it, read with where it came from, and clears it', async () => {
    await put('/engines/claude/output-style', { outputStyle: 'Concise' });
    const folder = root;
    expect(
      (await put('/engines/claude/output-style/folder', { folder, outputStyle: 'Explanatory' }))
        .status,
    ).toBe(200);

    const below = await get(`/engines/claude/output-style?folder=${encodeURIComponent(folder)}`);
    expect(below.body.effective).toEqual({ value: 'Explanatory', from: 'folder', folder });

    const cleared = await http()
      .delete(`/engines/claude/output-style/folder?folder=${encodeURIComponent(folder)}`)
      .set('authorization', `Bearer ${token}`);
    expect(cleared.status).toBe(204);

    const after = await get(`/engines/claude/output-style?folder=${encodeURIComponent(folder)}`);
    expect(after.body.effective.from).toBe('user');
  });

  it('unsets the user’s style when it is saved as null', async () => {
    await put('/engines/claude/output-style', { outputStyle: 'Concise' });
    const unset = await put('/engines/claude/output-style', { outputStyle: null });

    expect(unset.status).toBe(200);
    expect(unset.body.user).toBeNull();
  });

  it('refuses a malformed style, and the override of a folder of somebody else', async () => {
    expect((await put('/engines/claude/output-style', { outputStyle: '' })).status).toBe(400);
    expect(
      (
        await put(
          '/engines/claude/output-style/folder',
          { folder: root, outputStyle: 'Concise' },
          other,
        )
      ).status,
    ).toBe(403);
  });
});
