import { beforeEach, describe, expect, it } from 'vitest';

import { OidcDiscovery } from '@adapter/outbound/identity/oidc-discovery';
import { UnauthenticatedError } from '@domain/auth';
import { FixedClock } from '../../../../support/fakes/fixed-clock';
import { FakeIdentityProvider, ISSUER } from '../../../../support/identity/fake-oidc';
import { StubFetch } from '../../../../support/identity/stub-fetch';

const WELL_KNOWN = `${ISSUER}/.well-known/openid-configuration`;

describe('OidcDiscovery', () => {
  let provider: FakeIdentityProvider;
  let clock: FixedClock;
  let http: StubFetch;

  beforeEach(async () => {
    provider = await FakeIdentityProvider.create();
    clock = new FixedClock(new Date('2026-09-13T12:00:00.000Z'));
    http = new StubFetch();
  });

  it('discovers the endpoints instead of having them written by hand', async () => {
    http.on(WELL_KNOWN, { body: provider.discoveryDocument() });

    const document = await new OidcDiscovery(ISSUER, clock, http.fetch).document();

    expect(document).toEqual({
      issuer: ISSUER,
      jwksUri: `${ISSUER}/protocol/openid-connect/certs`,
      tokenEndpoint: `${ISSUER}/protocol/openid-connect/token`,
      authorizationEndpoint: `${ISSUER}/protocol/openid-connect/auth`,
    });
  });

  it('tolerates a trailing slash on the configured issuer', async () => {
    http.on(WELL_KNOWN, { body: provider.discoveryDocument() });

    await expect(
      new OidcDiscovery(`${ISSUER}/`, clock, http.fetch).document(),
    ).resolves.toMatchObject({ issuer: ISSUER });
  });

  it('fetches once and serves the rest from the cache', async () => {
    http.on(WELL_KNOWN, { body: provider.discoveryDocument() });
    const discovery = new OidcDiscovery(ISSUER, clock, http.fetch);

    await discovery.document();
    await discovery.document();
    await discovery.document();

    expect(http.countOf(WELL_KNOWN)).toBe(1);
  });

  it('fetches again once the cache has aged out', async () => {
    http.on(WELL_KNOWN, { body: provider.discoveryDocument() });
    const discovery = new OidcDiscovery(ISSUER, clock, http.fetch);

    await discovery.document();
    clock.advance(3_600_001);
    await discovery.document();

    expect(http.countOf(WELL_KNOWN)).toBe(2);
  });

  it('refuses when the provider is unreachable', async () => {
    http.on(WELL_KNOWN, { status: 503, body: {} });

    await expect(new OidcDiscovery(ISSUER, clock, http.fetch).document()).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  it('refuses a document missing an endpoint it needs', async () => {
    http.on(WELL_KNOWN, { body: { issuer: ISSUER } });

    await expect(new OidcDiscovery(ISSUER, clock, http.fetch).document()).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  it('refuses a document that claims a different issuer', async () => {
    http.on(WELL_KNOWN, { body: provider.discoveryDocument('https://somewhere.else') });

    await expect(new OidcDiscovery(ISSUER, clock, http.fetch).document()).rejects.toThrow(
      UnauthenticatedError,
    );
  });
});
