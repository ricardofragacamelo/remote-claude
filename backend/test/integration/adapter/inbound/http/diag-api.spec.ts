import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { InstallationVersionReader } from '@adapter/outbound/diag/installation-versions.reader';
import type { VersionReaders } from '@adapter/outbound/diag/installation-versions.reader';
import { readAgentSdkVersion, readBundledCliVersion } from '@adapter/outbound/claude/cli-version';
import { INSTALLATION_VERSION_SOURCE } from '@application/diag';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';

/**
 * `GET /diag/versions`, against the real application (plan 06, B-12).
 *
 * The reader is the product's own; only whether the CLI can be read is changed, by handing it a
 * reader that finds none — the machine running the suite has one.
 */
describe('the versions route', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let token: string;
  const reads = { claudeCli: 0 };

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    const readers: VersionReaders = {
      backend: () => ({ version: '0.0.0', reason: null }),
      agentSdk: () => readAgentSdkVersion(),
      claudeCli: () => {
        reads.claudeCli += 1;
        return readBundledCliVersion(() => {
          throw new Error('Cannot find module');
        });
      },
      node: () => process.versions.node,
    };

    harness = await startTestApp(database.url, identity, (builder) =>
      builder
        .overrideProvider(INSTALLATION_VERSION_SOURCE)
        .useValue(new InstallationVersionReader(readers)),
    );
    token = await identity.accessToken({ subject: SUBJECT });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  const versions = () =>
    request(harness.app.getHttpServer())
      .get('/diag/versions')
      .set({
        authorization: `Bearer ${token}`,
      });

  it('answers the backend, the SDK, the CLI and Node — S-65', async () => {
    const response = await versions();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      backend: { version: '0.0.0', reason: null },
      agentSdk: { version: expect.stringMatching(/^\d+\.\d+\.\d+/), reason: null },
      node: { version: process.versions.node, reason: null },
    });
  });

  it('answers 200 with null and the reason for a CLI it cannot read — S-66', async () => {
    const response = await versions();

    expect(response.status).toBe(200);
    expect(response.body.claudeCli).toEqual({ version: null, reason: 'notInstalled' });
  });

  it('answers 401 without a credential — S-67', async () => {
    const response = await request(harness.app.getHttpServer()).get('/diag/versions');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('reads the versions once, however often it is asked — S-68', async () => {
    await versions();
    const afterTheFirst = reads.claudeCli;

    await versions();
    await versions();

    expect(afterTheFirst).toBe(1);
    expect(reads.claudeCli).toBe(afterTheFirst);
  });
});
