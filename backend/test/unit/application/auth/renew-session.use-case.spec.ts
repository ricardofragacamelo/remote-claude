import { describe, expect, it, vi } from 'vitest';

import { AuthenticateUseCase, RenewSessionUseCase } from '@application/auth';
import type { AccessTokenVerifier, IdentityProvider } from '@application/auth';
import { UnauthenticatedError } from '@domain/auth';

const verifier: AccessTokenVerifier = {
  verify: () =>
    Promise.resolve({ subject: 'auth|42', expiresAt: new Date('2026-09-13T12:15:00.000Z') }),
};

describe('RenewSessionUseCase', () => {
  it('rotates the credential and reports the new one', async () => {
    const provider: IdentityProvider = {
      exchangeAuthorizationCode: () => Promise.reject(new Error('not used')),
      refresh: () =>
        Promise.resolve({ accessToken: 'a2', refreshToken: 'r2', expiresInSeconds: 900 }),
    };

    const session = await new RenewSessionUseCase(
      provider,
      new AuthenticateUseCase(verifier),
    ).execute('r1');

    expect(session.accessToken).toBe('a2');
    expect(session.refreshToken).toBe('r2');
  });

  it('refuses a request with no refresh token without calling the provider', async () => {
    const refresh = vi.fn();
    const provider: IdentityProvider = {
      exchangeAuthorizationCode: () => Promise.reject(new Error('not used')),
      refresh,
    };

    await expect(
      new RenewSessionUseCase(provider, new AuthenticateUseCase(verifier)).execute(null),
    ).rejects.toThrow(UnauthenticatedError);

    expect(refresh).not.toHaveBeenCalled();
  });

  it('propagates the provider rejecting a reused token', async () => {
    const provider: IdentityProvider = {
      exchangeAuthorizationCode: () => Promise.reject(new Error('not used')),
      refresh: () => Promise.reject(new UnauthenticatedError('token reuse detected')),
    };

    await expect(
      new RenewSessionUseCase(provider, new AuthenticateUseCase(verifier)).execute('reused'),
    ).rejects.toThrow(UnauthenticatedError);
  });
});
