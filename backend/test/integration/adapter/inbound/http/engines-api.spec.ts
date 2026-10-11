import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { isEngineListPayload } from '@remote-claude/contracts';

import { BUNDLED_CLI_VERSION } from '@adapter/outbound/engines/claude/cli-version';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';

/** `GET /engines` over the real application (plan 28, B-12): the engines enabled, as the contract types them. */
describe('the engines of the installation', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let token: string;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(BUNDLED_CLI_VERSION).useValue('2.1.277'),
      writeTestAllowlist([SUBJECT]),
    );
    token = await identity.accessToken({ subject: SUBJECT });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  it('lists the engines enabled, the default first, in the shape of the contract — S-28', async () => {
    const response = await request(harness.url)
      .get('/engines')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(isEngineListPayload(response.body)).toBe(true);
    expect(response.body).toMatchObject({
      defaultEngine: 'claude',
      engines: [
        {
          id: 'claude',
          displayName: 'Claude Code',
          state: 'available',
          reason: null,
          version: '2.1.277',
          capabilities: { resume: true, fork: 'atMessage', cost: 'usd' },
        },
      ],
    });
  });

  it('boots with the one engine named, and refuses to boot with an engine no adapter registers — S-28', async () => {
    const named = await startTestApp(
      database.url,
      identity,
      (builder) => builder,
      writeTestAllowlist([SUBJECT]),
      { RC_ENGINES_ENABLED: 'claude', RC_ENGINE_DEFAULT: 'claude' },
    );
    const listed = await request(named.url).get('/engines').set('authorization', `Bearer ${token}`);
    await named.close();

    expect(listed.body.engines).toHaveLength(1);
    await expect(
      startTestApp(database.url, identity, (builder) => builder, writeTestAllowlist([SUBJECT]), {
        RC_ENGINES_ENABLED: 'codex',
      }),
    ).rejects.toThrow('no adapter registers: codex');
  });

  it('answers `401` to nobody in particular', async () => {
    expect((await request(harness.url).get('/engines')).status).toBe(401);
  });
});
