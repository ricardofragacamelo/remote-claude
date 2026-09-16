import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../../../src/app.module';
import { ConfigurationError } from '@remote-claude/config';
import { startPostgres } from '../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../support/containers/postgres';
import { startIdentityServer } from '../../../support/identity/identity-server';
import type { IdentityServer } from '../../../support/identity/identity-server';
import { testEnvironment } from '../../../support/app/test-app';

describe('the boot', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  const original = { ...process.env };

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
  });

  afterAll(async () => {
    process.env = { ...original };
    await identity.stop();
    await database.stop();
  });

  /** Tries to build the container with the environment as it currently stands. */
  async function build(): Promise<void> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.close();
  }

  it('comes up when the environment is complete', async () => {
    testEnvironment(database.url, identity.issuer);

    await expect(build()).resolves.toBeUndefined();
  });

  it.each(['DATABASE_URL', 'OIDC_ISSUER', 'OIDC_AUDIENCE', 'LOG_LEVEL'])(
    'refuses to come up with %s missing',
    async (variable) => {
      testEnvironment(database.url, identity.issuer);
      delete process.env[variable];

      await expect(build()).rejects.toThrow(ConfigurationError);
    },
  );

  it('refuses to come up with a variable that is not a port', async () => {
    testEnvironment(database.url, identity.issuer);
    process.env['RC_BACKEND_PORT'] = 'nope';

    await expect(build()).rejects.toThrow(ConfigurationError);
  });

  it('says which variable and what was expected', async () => {
    expect.assertions(1);
    testEnvironment(database.url, identity.issuer);
    process.env['LOG_LEVEL'] = 'chatty';

    try {
      await build();
    } catch (error) {
      expect((error as ConfigurationError).message).toContain('LOG_LEVEL');
    }
  });

  it('never falls back to a default for a variable it cannot read', async () => {
    testEnvironment(database.url, identity.issuer);
    delete process.env['OIDC_AUDIENCE'];

    // A backend serving requests with a silently defaulted audience accepts tokens minted for
    // somebody else's API. Not starting is the safe outcome.
    await expect(build()).rejects.toThrow(ConfigurationError);
  });
});
