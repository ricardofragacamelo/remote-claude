import { beforeEach, describe, expect, it } from 'vitest';

import { JwksCache } from '@adapter/outbound/identity/jwks-cache';
import { OidcDiscovery } from '@adapter/outbound/identity/oidc-discovery';
import { OidcTokenVerifier } from '@adapter/outbound/identity/oidc-token-verifier.adapter';
import { TokenExpiredError, UnauthenticatedError } from '@domain/auth';
import type { AppConfig } from '@infra/config/environment';
import { FixedClock } from '../../../../support/fakes/fixed-clock';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';
import { AUDIENCE, FakeIdentityProvider, ISSUER } from '../../../../support/identity/fake-oidc';
import { StubFetch } from '../../../../support/identity/stub-fetch';

const WELL_KNOWN = `${ISSUER}/.well-known/openid-configuration`;
const JWKS_URI = `${ISSUER}/protocol/openid-connect/certs`;

const config = {
  oidc: { audience: AUDIENCE },
} as AppConfig;

describe('OidcTokenVerifier', () => {
  let provider: FakeIdentityProvider;
  let log: RecordingLogger;
  let verifier: OidcTokenVerifier;

  beforeEach(async () => {
    provider = await FakeIdentityProvider.create();
    const clock = new FixedClock(new Date());
    const http = new StubFetch()
      .on(WELL_KNOWN, { body: provider.discoveryDocument() })
      .on(JWKS_URI, { body: provider.jwks() });

    log = new RecordingLogger();
    verifier = new OidcTokenVerifier(
      new OidcDiscovery(ISSUER, clock, http.fetch),
      new JwksCache(clock, http.fetch),
      config,
      log.logger,
    );
  });

  it('accepts a token the issuer signed for this audience', async () => {
    const verified = await verifier.verify(await provider.accessToken({ subject: 'auth|42' }));

    expect(verified.subject).toBe('auth|42');
    expect(verified.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses a token signed by a key the issuer never published', async () => {
    await expect(verifier.verify(await provider.forgedToken())).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  it('refuses a token minted for another audience', async () => {
    await expect(
      verifier.verify(await provider.accessToken({ audience: 'https://someone.else' })),
    ).rejects.toThrow(UnauthenticatedError);
  });

  it('refuses a token from another issuer', async () => {
    await expect(
      verifier.verify(await provider.accessToken({ issuer: 'https://evil.test' })),
    ).rejects.toThrow(UnauthenticatedError);
  });

  it('tells an expired credential apart, so the client knows to renew', async () => {
    const expired = await provider.accessToken({ expiresAt: new Date(Date.now() - 120_000) });

    await expect(verifier.verify(expired)).rejects.toThrow(TokenExpiredError);
  });

  it('still accepts a token that expired within the clock tolerance', async () => {
    const barely = await provider.accessToken({ expiresAt: new Date(Date.now() - 30_000) });

    await expect(verifier.verify(barely)).resolves.toMatchObject({ subject: 'auth|42' });
  });

  it('refuses a token that is not valid yet', async () => {
    const future = await provider.accessToken({ notBefore: new Date(Date.now() + 600_000) });

    await expect(verifier.verify(future)).rejects.toThrow(UnauthenticatedError);
  });

  it('refuses `alg: none`, which is the classic attempt', async () => {
    await expect(verifier.verify(provider.unsignedToken())).rejects.toThrow(UnauthenticatedError);
  });

  it('refuses a token whose header names no key', async () => {
    const headerless = `${Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')}.e30.`;

    await expect(verifier.verify(headerless)).rejects.toThrow(UnauthenticatedError);
  });

  it('refuses a token whose key id the issuer does not publish', async () => {
    await expect(
      verifier.verify(await provider.accessToken({ keyId: 'kid-nobody-has' })),
    ).rejects.toThrow(UnauthenticatedError);
  });

  it('refuses a token carrying no subject claim', async () => {
    await expect(verifier.verify(await provider.subjectlessToken())).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  it('refuses something that is not a token at all', async () => {
    await expect(verifier.verify('not.a.token')).rejects.toThrow(UnauthenticatedError);
  });

  it('writes the exact reason to the log, and never into the error the caller sees', async () => {
    expect.assertions(3);

    try {
      await verifier.verify(await provider.accessToken({ audience: 'https://someone.else' }));
    } catch (error) {
      expect((error as UnauthenticatedError).code).toBe('UNAUTHENTICATED');
      expect((error as UnauthenticatedError).params).toEqual({});
      expect(log.withOp('auth.verify')).toHaveLength(1);
    }
  });

  it('never writes the token itself', async () => {
    const token = await provider.accessToken({ audience: 'https://someone.else' });

    await verifier.verify(token).catch(() => undefined);

    expect(JSON.stringify(log.lines)).not.toContain(token);
  });
});
