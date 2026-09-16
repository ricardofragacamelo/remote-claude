import { describe, expect, it } from 'vitest';

import { createPkcePair, randomToken } from '@/features/auth/services/pkce';

describe('randomToken', () => {
  it('is long enough for a code verifier, as the specification requires', () => {
    expect(randomToken().length).toBeGreaterThanOrEqual(43);
    expect(randomToken().length).toBeLessThanOrEqual(128);
  });

  it('uses only characters an OIDC parameter is allowed to carry', () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('never repeats itself', () => {
    expect(new Set(Array.from({ length: 200 }, () => randomToken())).size).toBe(200);
  });

  it('can be asked for a shorter one, for a state parameter', () => {
    expect(randomToken(16).length).toBeLessThan(randomToken(32).length);
  });
});

describe('createPkcePair', () => {
  it('publishes a challenge that is not the verifier', async () => {
    const { verifier, challenge } = await createPkcePair();

    expect(challenge).not.toBe(verifier);
  });

  it('derives the challenge with SHA-256, so it is always the same length', async () => {
    const first = await createPkcePair();
    const second = await createPkcePair();

    expect(first.challenge).toHaveLength(43);
    expect(second.challenge).toHaveLength(43);
  });

  it('derives a different challenge for a different verifier', async () => {
    const first = await createPkcePair();
    const second = await createPkcePair();

    expect(first.challenge).not.toBe(second.challenge);
  });

  it('produces a challenge in the URL-safe alphabet', async () => {
    const { challenge } = await createPkcePair();

    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
  });
});
