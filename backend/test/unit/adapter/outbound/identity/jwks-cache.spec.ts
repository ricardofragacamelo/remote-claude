import { beforeEach, describe, expect, it } from 'vitest';

import { JwksCache } from '@adapter/outbound/identity/jwks-cache';
import { UnauthenticatedError } from '@domain/auth';
import { FixedClock } from '../../../../support/fakes/fixed-clock';
import { FakeIdentityProvider } from '../../../../support/identity/fake-oidc';
import { StubFetch } from '../../../../support/identity/stub-fetch';

const JWKS_URI = 'https://identity.test/certs';

describe('JwksCache', () => {
  let provider: FakeIdentityProvider;
  let clock: FixedClock;
  let http: StubFetch;

  beforeEach(async () => {
    provider = await FakeIdentityProvider.create('kid-1');
    clock = new FixedClock(new Date('2026-09-13T12:00:00.000Z'));
    http = new StubFetch();
  });

  it('fetches the key set on the first request', async () => {
    http.on(JWKS_URI, { body: provider.jwks() });

    await expect(new JwksCache(clock, http.fetch).keyFor(JWKS_URI, 'kid-1')).resolves.toBeDefined();
    expect(http.countOf(JWKS_URI)).toBe(1);
  });

  it('serves a known key without fetching again', async () => {
    http.on(JWKS_URI, { body: provider.jwks() });
    const cache = new JwksCache(clock, http.fetch);

    await cache.keyFor(JWKS_URI, 'kid-1');
    await cache.keyFor(JWKS_URI, 'kid-1');

    expect(http.countOf(JWKS_URI)).toBe(1);
  });

  it('reloads once when the key id is unknown, because providers rotate silently', async () => {
    const rotated = await FakeIdentityProvider.create('kid-2');
    http.on(JWKS_URI, { body: provider.jwks() }).on(JWKS_URI, { body: rotated.jwks() });
    const cache = new JwksCache(clock, http.fetch);

    await cache.keyFor(JWKS_URI, 'kid-1');
    clock.advance(60_001);

    await expect(cache.keyFor(JWKS_URI, 'kid-2')).resolves.toBeDefined();
    expect(http.countOf(JWKS_URI)).toBe(2);
  });

  it('refuses when the key is still unknown after the reload', async () => {
    http.on(JWKS_URI, { body: provider.jwks() });

    await expect(new JwksCache(clock, http.fetch).keyFor(JWKS_URI, 'nope')).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  it('refuses without refetching while the cooldown holds', async () => {
    http.on(JWKS_URI, { body: provider.jwks() });
    const cache = new JwksCache(clock, http.fetch);

    await cache.keyFor(JWKS_URI, 'kid-1');

    await expect(cache.keyFor(JWKS_URI, 'nope')).rejects.toThrow(UnauthenticatedError);
    expect(http.countOf(JWKS_URI)).toBe(1);
  });

  it('refuses when the key endpoint is unreachable', async () => {
    http.on(JWKS_URI, { status: 500, body: {} });

    await expect(new JwksCache(clock, http.fetch).keyFor(JWKS_URI, 'kid-1')).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  it('refuses when the key set has no `keys` at all', async () => {
    http.on(JWKS_URI, { body: { nothing: true } });

    await expect(new JwksCache(clock, http.fetch).keyFor(JWKS_URI, 'kid-1')).rejects.toThrow(
      UnauthenticatedError,
    );
  });
});
