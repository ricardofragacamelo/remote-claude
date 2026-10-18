import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  readAgentSdkVersion,
  readBundledCliVersion,
} from '@adapter/outbound/engines/claude/cli-version';
import { CLAUDE_INSTALLATION } from '@adapter/outbound/engines/claude/claude-installation';
import type { ClaudeInstallation } from '@adapter/outbound/engines/claude/claude-installation';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';

/**
 * `GET /diag/versions`, against the real application (plan 06, B-12).
 *
 * The versions of the engine are what the default engine describes itself with (plan 28, B-34): one
 * app reads the installation of the machine running the suite, as the product does; another is told
 * the CLI cannot be read — the machine running the suite has one — and counts how often it is read.
 */
describe('the versions route', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let unreadable: TestApp;
  let token: string;
  const reads = { installation: 0 };

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    harness = await startTestApp(database.url, identity, (builder) => builder);
    unreadable = await startTestApp(database.url, identity, (builder) =>
      builder.overrideProvider(CLAUDE_INSTALLATION).useFactory({
        factory: (): ClaudeInstallation => {
          reads.installation += 1;
          return {
            cli: readBundledCliVersion(() => {
              throw new Error('Cannot find module');
            }),
            sdk: readAgentSdkVersion(),
          };
        },
      }),
    );
    token = await identity.accessToken({ subject: SUBJECT });
  });

  afterAll(async () => {
    await unreadable.close();
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  const versions = (app: TestApp = harness) =>
    request(app.app.getHttpServer())
      .get('/diag/versions')
      .set({
        authorization: `Bearer ${token}`,
      });

  /** The default engine's own line of `engines[]`. */
  const defaultEngineOf = (body: { defaultEngine: string; engines: { engine: string }[] }) =>
    body.engines.find((engine) => engine.engine === body.defaultEngine);

  it('answers the backend, the default engine and Node — S-65', async () => {
    const response = await versions();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      backend: { version: '0.0.0', reason: null },
      node: { version: process.versions.node, reason: null },
    });
    expect(defaultEngineOf(response.body)).toMatchObject({
      library: { version: expect.stringMatching(/^\d+\.\d+\.\d+/), reason: null },
    });
  });

  it('answers the same versions as before, now from the engine’s own description — plan 28, S-100', async () => {
    const response = await versions();

    expect(response.status).toBe(200);
    // What the route read straight from the files of the SDK until the engine described itself.
    expect(defaultEngineOf(response.body)).toMatchObject({
      library: readAgentSdkVersion(),
      binary: readBundledCliVersion(),
    });
  });

  it('answers 200 with null and the reason for a CLI it cannot read — S-66', async () => {
    const response = await versions(unreadable);

    expect(response.status).toBe(200);
    expect(defaultEngineOf(response.body)).toMatchObject({
      binary: { version: null, reason: 'notInstalled' },
      library: readAgentSdkVersion(),
    });
  });

  it('answers 401 without a credential — S-67', async () => {
    const response = await request(harness.app.getHttpServer()).get('/diag/versions');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('reads the versions once, however often it is asked — S-68', async () => {
    await versions(unreadable);
    await versions(unreadable);
    await versions(unreadable);

    expect(reads.installation).toBe(1);
  });
});
