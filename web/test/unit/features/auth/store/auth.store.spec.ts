import { beforeEach, describe, expect, it } from 'vitest';

import { RENEW_AT, renewalDelay, useAuthStore } from '@/features/auth/store/auth.store';

const session = {
  accessToken: 'token-1',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
};

describe('the auth store', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
  });

  it('starts not knowing whether anybody is signed in', () => {
    expect(useAuthStore.getState().status).toBe('unknown');
  });

  it('holds the session once somebody signs in', () => {
    useAuthStore.getState().signedIn(session);

    expect(useAuthStore.getState()).toMatchObject({ status: 'authenticated', session });
  });

  it('drops the session on sign-out', () => {
    useAuthStore.getState().signedIn(session);
    useAuthStore.getState().signedOut();

    expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', session: null });
  });
});

describe('renewalDelay', () => {
  it('renews well before the credential expires', () => {
    const now = 1_000_000;

    expect(renewalDelay({ ...session, expiresAt: now + 900_000 }, now)).toBe(900_000 * RENEW_AT);
  });

  it('renews at once for a credential that has already expired', () => {
    const now = 1_000_000;

    expect(renewalDelay({ ...session, expiresAt: now - 1 }, now)).toBe(0);
  });

  it('never asks to wait a negative amount of time', () => {
    expect(renewalDelay({ ...session, expiresAt: 0 }, 10_000_000)).toBe(0);
  });
});
