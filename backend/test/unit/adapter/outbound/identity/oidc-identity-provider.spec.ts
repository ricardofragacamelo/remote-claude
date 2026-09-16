import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OidcDiscovery } from '@adapter/outbound/identity/oidc-discovery';
import { OidcIdentityProvider } from '@adapter/outbound/identity/oidc-identity-provider.adapter';
import { UnauthenticatedError } from '@domain/auth';
import type { AppConfig } from '@infra/config/environment';
import { FixedClock } from '../../../../support/fakes/fixed-clock';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';
import { FakeIdentityProvider, ISSUER } from '../../../../support/identity/fake-oidc';
import { StubFetch } from '../../../../support/identity/stub-fetch';

const WELL_KNOWN = `${ISSUER}/.well-known/openid-configuration`;
const TOKEN_ENDPOINT = `${ISSUER}/protocol/openid-connect/token`;

const config = { oidc: { webClientId: 'remote-claude-web' } } as AppConfig;
const exchange = { code: 'c', codeVerifier: 'v', redirectUri: 'http://localhost:5173/callback' };

/** The last body posted to the token endpoint, parsed. */
function postedForm(call: [unknown, RequestInit?]): URLSearchParams {
  return new URLSearchParams(String(call[1]?.body ?? ''));
}

describe('OidcIdentityProvider', () => {
  let log: RecordingLogger;
  let identity: OidcIdentityProvider;
  let post: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const provider = await FakeIdentityProvider.create();
    const discovery = new StubFetch().on(WELL_KNOWN, { body: provider.discoveryDocument() });

    log = new RecordingLogger();
    identity = new OidcIdentityProvider(
      new OidcDiscovery(ISSUER, new FixedClock(new Date()), discovery.fetch),
      config,
      log.logger,
    );

    post = vi
      .fn()
      .mockResolvedValue(Response.json({ access_token: 'a', refresh_token: 'r', expires_in: 900 }));
    vi.stubGlobal('fetch', post);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('completes the PKCE exchange at the discovered token endpoint', async () => {
    const issued = await identity.exchangeAuthorizationCode(exchange);

    expect(issued).toEqual({ accessToken: 'a', refreshToken: 'r', expiresInSeconds: 900 });
    expect(post.mock.calls[0]?.[0]).toBe(TOKEN_ENDPOINT);
  });

  it('sends the grant, the verifier and the public client id', async () => {
    await identity.exchangeAuthorizationCode(exchange);

    const form = postedForm(post.mock.calls[0] as [unknown, RequestInit?]);
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code_verifier')).toBe('v');
    expect(form.get('client_id')).toBe('remote-claude-web');
  });

  it('rotates a refresh token', async () => {
    await identity.refresh('r1');

    const form = postedForm(post.mock.calls[0] as [unknown, RequestInit?]);
    expect(form.get('grant_type')).toBe('refresh_token');
    expect(form.get('refresh_token')).toBe('r1');
  });

  it('reports no refresh token when the provider issued none', async () => {
    post.mockResolvedValue(Response.json({ access_token: 'a', expires_in: 900 }));

    await expect(identity.exchangeAuthorizationCode(exchange)).resolves.toMatchObject({
      refreshToken: null,
    });
  });

  it('refuses when the provider rejects the grant', async () => {
    post.mockResolvedValue(Response.json({ error: 'invalid_grant' }, { status: 400 }));

    await expect(identity.exchangeAuthorizationCode(exchange)).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  it('refuses a body it cannot use', async () => {
    post.mockResolvedValue(Response.json({ nothing: true }));

    await expect(identity.refresh('r1')).rejects.toThrow(UnauthenticatedError);
  });

  it('logs the edge without ever writing the credential', async () => {
    await identity.exchangeAuthorizationCode(exchange);

    const written = JSON.stringify(log.lines);
    expect(log.withOp('auth.exchange')[0]).toMatchObject({ httpStatus: 200 });
    expect(written).not.toContain('"a"');
    expect(written).not.toContain('code_verifier');
  });
});
