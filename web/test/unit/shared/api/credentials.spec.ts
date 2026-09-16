import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  credentials,
  currentLocale,
  setAccessToken,
  setLocale,
  setRenewer,
} from '@/shared/api/credentials';

afterEach(() => {
  setAccessToken(null);
  setRenewer(null);
  setLocale('en');
});

describe('the credential holder', () => {
  it('starts with nobody signed in', () => {
    expect(credentials.accessToken()).toBeNull();
  });

  it('hands the transport the token the feature pushed in', () => {
    setAccessToken('token-1');

    expect(credentials.accessToken()).toBe('token-1');
  });

  it('forgets the token on sign-out', () => {
    setAccessToken('token-1');
    setAccessToken(null);

    expect(credentials.accessToken()).toBeNull();
  });

  it('answers no renewal while none is wired in', async () => {
    await expect(credentials.renew()).resolves.toBeNull();
  });

  it('delegates renewal to whatever the feature wired in', async () => {
    const renew = vi.fn().mockResolvedValue('token-2');
    setRenewer(renew);

    await expect(credentials.renew()).resolves.toBe('token-2');
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it('carries the language of this client', () => {
    setLocale('pt-BR');

    expect(currentLocale()).toBe('pt-BR');
  });
});
