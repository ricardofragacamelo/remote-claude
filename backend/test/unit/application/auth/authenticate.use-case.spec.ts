import { describe, expect, it } from 'vitest';

import { AuthenticateUseCase } from '@application/auth';
import type { AccessTokenVerifier } from '@application/auth';
import { InvalidUserIdError, TokenExpiredError } from '@domain/auth';

const expiresAt = new Date('2026-09-13T12:15:00.000Z');

const verifier = (subject: string): AccessTokenVerifier => ({
  verify: () => Promise.resolve({ subject, expiresAt }),
});

describe('AuthenticateUseCase', () => {
  it('turns a valid token into an identity anchored on the subject claim', async () => {
    const authentication = await new AuthenticateUseCase(verifier('auth|42')).execute('token');

    expect(authentication.userId.value).toBe('auth|42');
    expect(authentication.expiresAt).toEqual(expiresAt);
  });

  it('refuses a token whose subject claim is unusable', async () => {
    await expect(new AuthenticateUseCase(verifier('  ')).execute('token')).rejects.toThrow(
      InvalidUserIdError,
    );
  });

  it('lets the verifier decide that the credential expired', async () => {
    const expired: AccessTokenVerifier = { verify: () => Promise.reject(new TokenExpiredError()) };

    await expect(new AuthenticateUseCase(expired).execute('token')).rejects.toThrow(
      TokenExpiredError,
    );
  });
});
