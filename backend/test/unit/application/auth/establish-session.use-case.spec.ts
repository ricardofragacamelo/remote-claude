import { describe, expect, it, vi } from 'vitest';

import { AuthenticateUseCase, EstablishSessionUseCase } from '@application/auth';
import type { AccessTokenVerifier, IdentityProvider } from '@application/auth';
import { UnauthenticatedError } from '@domain/auth';

const expiresAt = new Date('2026-09-13T12:15:00.000Z');
const verifier: AccessTokenVerifier = {
  verify: () => Promise.resolve({ subject: 'auth|42', expiresAt }),
};

const exchange = { code: 'c', codeVerifier: 'v', redirectUri: 'http://localhost:5173/callback' };

describe('EstablishSessionUseCase', () => {
  it('exchanges the code and reports who the tokens belong to', async () => {
    const provider: IdentityProvider = {
      exchangeAuthorizationCode: () =>
        Promise.resolve({ accessToken: 'a', refreshToken: 'r', expiresInSeconds: 900 }),
      refresh: () => Promise.reject(new Error('not used')),
    };

    const session = await new EstablishSessionUseCase(
      provider,
      new AuthenticateUseCase(verifier),
    ).execute(exchange);

    expect(session).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresInSeconds: 900,
      userId: expect.objectContaining({ value: 'auth|42' }),
    });
  });

  it('validates the access token it was just handed', async () => {
    const verify = vi.fn().mockResolvedValue({ subject: 'auth|42', expiresAt });
    const provider: IdentityProvider = {
      exchangeAuthorizationCode: () =>
        Promise.resolve({ accessToken: 'minted', refreshToken: null, expiresInSeconds: 900 }),
      refresh: () => Promise.reject(new Error('not used')),
    };

    await new EstablishSessionUseCase(provider, new AuthenticateUseCase({ verify })).execute(
      exchange,
    );

    expect(verify).toHaveBeenCalledWith('minted');
  });

  it('propagates the provider refusing the code', async () => {
    const provider: IdentityProvider = {
      exchangeAuthorizationCode: () => Promise.reject(new UnauthenticatedError('invalid_grant')),
      refresh: () => Promise.reject(new Error('not used')),
    };

    await expect(
      new EstablishSessionUseCase(provider, new AuthenticateUseCase(verifier)).execute(exchange),
    ).rejects.toThrow(UnauthenticatedError);
  });
});
