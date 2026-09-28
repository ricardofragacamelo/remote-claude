import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { IDENTITY_JWKS } from '@adapter/outbound/identity/identity.tokens';
import { JwksCache } from '@adapter/outbound/identity/jwks-cache';
import { ROTATION_GRACE_MS } from '@application/auth/renew-session.use-case';
import { CLOCK } from '@application/shared';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { FixedClock } from '../../../../support/fakes/fixed-clock';
import { FakeIdentityProvider } from '../../../../support/identity/fake-oidc';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';

/** A `set-cookie` header, as a single string. */
function setCookie(headers: Record<string, unknown>): string {
  const raw = headers['set-cookie'];
  return Array.isArray(raw) ? raw.join('; ') : String(raw ?? '');
}

/**
 * The identity edge, against the real application and a provider on localhost (plan 05, B-12 and
 * B-13).
 *
 * Every scenario here is about the backend **not trusting** something: not the token's claims about
 * itself, not the provider's key set being the one it read an hour ago, not two browser tabs to
 * renew one at a time. The provider is a local server because trusting a real one is the thing a
 * test cannot do — docs/architecture/shared/08-authentication.md#testes.
 */
describe('the identity edge', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let keys: FixedClock;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    keys = new FixedClock(new Date());
    // The clock is the one thing the suite moves: the key set's reload cooldown is a minute long and
    // a rotation's grace ten seconds, and a scenario that waited for either would be the suite doing
    // nothing for that long.
    harness = await startTestApp(database.url, identity, (builder) =>
      builder
        .overrideProvider(CLOCK)
        .useValue(keys)
        .overrideProvider(IDENTITY_JWKS)
        .useValue(new JwksCache(keys)),
    );
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  beforeEach(() => {
    harness.log.lines.length = 0;
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());

  const devices = (token: string): request.Test =>
    http().get('/devices').set('authorization', `Bearer ${token}`);

  describe('the provider is read, not written down', () => {
    // S-71, then S-23: the first burst is the one that finds nothing loaded yet.
    it('answers a burst of first requests with one read of the key set, and all of them pass', async () => {
      const token = await identity.accessToken();

      const answers = await Promise.all(Array.from({ length: 8 }, () => devices(token)));

      expect(answers.map((answer) => answer.status)).toEqual(Array(8).fill(200));
      expect(identity.hits.certs).toBe(1);
      expect(identity.hits.discovery).toBe(1);
    });

    it('reads the discovery document once and serves the next requests from the cache', async () => {
      const token = await identity.accessToken();
      const before = identity.hits.discovery;

      for (let index = 0; index < 3; index += 1) {
        expect((await devices(token)).status).toBe(200);
      }

      expect(before).toBe(1);
      expect(identity.hits.discovery).toBe(1);
    });

    // S-24
    it('rereads the key set once when a token names a key it has not seen, and accepts it', async () => {
      const rotated = await FakeIdentityProvider.create('test-key-rotated');
      identity.publish(rotated);
      keys.advance(60_001);
      const before = identity.hits.certs;
      const token = await rotated.accessToken({ issuer: identity.issuer });

      const first = await devices(token);
      const second = await devices(token);

      expect([first.status, second.status]).toEqual([200, 200]);
      expect(identity.hits.certs).toBe(before + 1);
    });

    it('does not reread the key set for a key nobody publishes, inside the cooldown', async () => {
      keys.advance(60_001);
      const before = identity.hits.certs;
      const unknown = await identity.accessToken({ keyId: 'kid-nobody-has' });

      const first = await devices(unknown);
      const second = await devices(unknown);

      expect([first.status, second.status]).toEqual([401, 401]);
      expect(identity.hits.certs).toBe(before + 1);
    });
  });

  // S-26
  describe('a token for somebody else', () => {
    it.each([
      ['another audience', { audience: 'https://someone.else' }, 'aud'],
      ['another issuer', { issuer: 'https://evil.test/realms/remote-claude' }, 'iss'],
    ])(
      'answers %s with the same 401 as any other, and names the claim only in the log',
      async (_what, overrides, claim) => {
        const response = await devices(await identity.accessToken(overrides));

        expect(response.status).toBe(401);
        expect(response.body.error).toMatchObject({
          code: 'UNAUTHENTICATED',
          messageKey: 'auth.error.unauthenticated',
        });
        expect(JSON.stringify(response.body)).not.toContain(claim);
        expect(harness.log.withOp('auth.verify')[0]?.['err']).toMatchObject({
          message: expect.stringContaining(`"${claim}"`),
        });
      },
    );
  });

  // S-61
  describe('a token without a verified identity', () => {
    const context = (): PersistenceContext =>
      harness.app.get<PersistenceContext>(PERSISTENCE_CONTEXT);

    it.each([
      ['no email', { email: null }],
      ['email_verified: false', { emailVerified: false }],
      ['no email_verified', { emailVerified: null }],
    ])('refuses %s with 401, and nothing is provisioned for it', async (_what, overrides) => {
      await context().db.execute('DELETE FROM devices');
      const token = await identity.accessToken({ subject: 'auth|unverified', ...overrides });

      const response = await http().post('/devices').set('authorization', `Bearer ${token}`).send({
        installId: 'install-unverified',
        name: 'Pixel 8',
        platform: 'android',
        appVersion: '1.0.0',
        pushToken: null,
        locale: 'en',
      });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
      expect((await context().db.execute('SELECT id FROM devices')).rows).toHaveLength(0);
    });

    it('refuses a token with no subject, whatever else it carries', async () => {
      const response = await devices(await identity.provider.subjectlessToken());

      expect(response.status).toBe(401);
    });
  });

  describe('POST /auth/refresh, against a provider that rotates', () => {
    const refresh = (token: string): request.Test =>
      http().post('/auth/refresh').set('Cookie', `rc_refresh=${token}`);

    // S-28
    it('turns concurrent renewals from every tab of one browser into one call to the provider', async () => {
      const shared = identity.startFamily(SUBJECT);
      const before = identity.tokenRequests.length;

      const answers = await Promise.all(Array.from({ length: 5 }, () => refresh(shared)));

      expect(answers.map((answer) => answer.status)).toEqual(Array(5).fill(200));
      expect(identity.tokenRequests.length - before).toBe(1);
      expect(new Set(answers.map((answer) => answer.body.accessToken as string)).size).toBe(1);
    });

    // S-27
    it('answers a reused token with 401, and the whole family stops working', async () => {
      const first = identity.startFamily(SUBJECT);

      const rotated = await refresh(first);
      const next = /rc_refresh=([^;]+)/.exec(setCookie(rotated.headers as Record<string, unknown>));
      keys.advance(ROTATION_GRACE_MS);
      const reused = await refresh(first);
      const afterwards = await refresh(next?.[1] ?? '');

      expect(rotated.status).toBe(200);
      expect(reused.status).toBe(401);
      expect(reused.body.error.code).toBe('UNAUTHENTICATED');
      expect(afterwards.status).toBe(401);
    });

    // S-76
    it('answers a tab that left with the old token just before the rotation with that rotation', async () => {
      const shared = identity.startFamily(SUBJECT);
      const before = identity.tokenRequests.length;

      const first = await refresh(shared);
      keys.advance(ROTATION_GRACE_MS - 1_000);
      const late = await refresh(shared);

      expect([first.status, late.status]).toEqual([200, 200]);
      expect(late.body.accessToken).toBe(first.body.accessToken);
      expect(identity.tokenRequests.length - before).toBe(1);
    });

    it('drops the cookie of a refused token, so the browser stops presenting it', async () => {
      const first = identity.startFamily(SUBJECT);
      await refresh(first);
      keys.advance(ROTATION_GRACE_MS);

      const reused = await refresh(first);

      expect(setCookie(reused.headers as Record<string, unknown>)).toContain('rc_refresh=;');
    });

    it('hands the ID token back with the session, for the logout to name it', async () => {
      identity.answerToken({
        status: 200,
        body: {
          access_token: await identity.accessToken(),
          refresh_token: 'r-with-id',
          expires_in: 900,
          id_token: 'the-id-token',
        },
      });

      const response = await refresh('r-before-id');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ idToken: 'the-id-token', userId: SUBJECT });
    });
  });
});
