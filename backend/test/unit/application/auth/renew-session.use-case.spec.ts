import { describe, expect, it, vi } from 'vitest';

import { AuthenticateUseCase, RenewSessionUseCase } from '@application/auth';
import type { AccessTokenVerifier, IdentityProvider, IssuedTokens } from '@application/auth';
import { UnauthenticatedError } from '@domain/auth';
import { ROTATION_GRACE_MS } from '@application/auth/renew-session.use-case';
import { FixedClock } from '../../../support/fakes/fixed-clock';

const verifier: AccessTokenVerifier = {
  verify: () =>
    Promise.resolve({ subject: 'auth|42', expiresAt: new Date('2026-09-13T12:15:00.000Z') }),
};

const clock = new FixedClock(new Date('2026-09-13T12:00:00.000Z'));

describe('RenewSessionUseCase', () => {
  it('rotates the credential and reports the new one', async () => {
    const provider: IdentityProvider = {
      exchangeAuthorizationCode: () => Promise.reject(new Error('not used')),
      refresh: () =>
        Promise.resolve({
          accessToken: 'a2',
          refreshToken: 'r2',
          expiresInSeconds: 900,
          idToken: null,
        }),
    };

    const session = await new RenewSessionUseCase(
      provider,
      new AuthenticateUseCase(verifier),
      clock,
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
      new RenewSessionUseCase(provider, new AuthenticateUseCase(verifier), clock).execute(null),
    ).rejects.toThrow(UnauthenticatedError);

    expect(refresh).not.toHaveBeenCalled();
  });

  it('propagates the provider rejecting a reused token', async () => {
    const provider: IdentityProvider = {
      exchangeAuthorizationCode: () => Promise.reject(new Error('not used')),
      refresh: () => Promise.reject(new UnauthenticatedError('token reuse detected')),
    };

    await expect(
      new RenewSessionUseCase(provider, new AuthenticateUseCase(verifier), clock).execute('reused'),
    ).rejects.toThrow(UnauthenticatedError);
  });

  it('makes one call to the provider for concurrent renewals of the same token (S-28)', async () => {
    let settle: (tokens: IssuedTokens) => void = () => undefined;
    const refresh = vi.fn(
      () =>
        new Promise<IssuedTokens>((resolve) => {
          settle = resolve;
        }),
    );
    const useCase = new RenewSessionUseCase(
      { exchangeAuthorizationCode: () => Promise.reject(new Error('not used')), refresh },
      new AuthenticateUseCase(verifier),
      new FixedClock(new Date('2026-09-13T12:00:00.000Z')),
    );

    const renewals = Promise.all([useCase.execute('r1'), useCase.execute('r1')]);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    settle({ accessToken: 'a2', refreshToken: 'r2', expiresInSeconds: 900, idToken: null });

    const [first, second] = await renewals;
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('keeps renewals of different tokens apart', async () => {
    const refresh = vi.fn((token: string) =>
      Promise.resolve({
        accessToken: `a-${token}`,
        refreshToken: `${token}+`,
        expiresInSeconds: 900,
        idToken: null,
      }),
    );
    const useCase = new RenewSessionUseCase(
      { exchangeAuthorizationCode: () => Promise.reject(new Error('not used')), refresh },
      new AuthenticateUseCase(verifier),
      new FixedClock(new Date('2026-09-13T12:00:00.000Z')),
    );

    const [one, other] = await Promise.all([useCase.execute('r1'), useCase.execute('r9')]);

    expect(refresh).toHaveBeenCalledTimes(2);
    expect([one.accessToken, other.accessToken]).toEqual(['a-r1', 'a-r9']);
  });

  // S-76
  it('answers a token presented just after its rotation with that same rotation', async () => {
    const late = new FixedClock(new Date('2026-09-13T12:00:00.000Z'));
    const refresh = vi.fn().mockResolvedValue({
      accessToken: 'a2',
      refreshToken: 'r2',
      expiresInSeconds: 900,
      idToken: null,
    });
    const useCase = new RenewSessionUseCase(
      { exchangeAuthorizationCode: () => Promise.reject(new Error('not used')), refresh },
      new AuthenticateUseCase(verifier),
      late,
    );

    const first = await useCase.execute('r1');
    late.advance(ROTATION_GRACE_MS - 1);

    await expect(useCase.execute('r1')).resolves.toBe(first);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('sends a token presented once the grace is over to the provider, as the reuse it is', async () => {
    const late = new FixedClock(new Date('2026-09-13T12:00:00.000Z'));
    const refresh = vi
      .fn()
      .mockResolvedValueOnce({
        accessToken: 'a2',
        refreshToken: 'r2',
        expiresInSeconds: 900,
        idToken: null,
      })
      .mockRejectedValueOnce(new UnauthenticatedError('token reuse detected'));
    const useCase = new RenewSessionUseCase(
      { exchangeAuthorizationCode: () => Promise.reject(new Error('not used')), refresh },
      new AuthenticateUseCase(verifier),
      late,
    );

    await useCase.execute('r1');
    late.advance(ROTATION_GRACE_MS);

    await expect(useCase.execute('r1')).rejects.toThrow(UnauthenticatedError);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('shares a refusal with every concurrent caller, and forgets it afterwards', async () => {
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new UnauthenticatedError('refused'))
      .mockResolvedValueOnce({
        accessToken: 'a3',
        refreshToken: 'r3',
        expiresInSeconds: 900,
        idToken: null,
      });
    const useCase = new RenewSessionUseCase(
      { exchangeAuthorizationCode: () => Promise.reject(new Error('not used')), refresh },
      new AuthenticateUseCase(verifier),
      new FixedClock(new Date('2026-09-13T12:00:00.000Z')),
    );

    const outcomes = await Promise.allSettled([useCase.execute('r1'), useCase.execute('r1')]);

    expect(outcomes.map((outcome) => outcome.status)).toEqual(['rejected', 'rejected']);
    await expect(useCase.execute('r1')).resolves.toMatchObject({ accessToken: 'a3' });
  });
});
