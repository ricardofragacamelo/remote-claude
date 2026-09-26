import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { exportPKCS8, generateKeyPair } from 'jose';

import {
  PushAccessTokenCache,
  PushAuthorizationFailedError,
  TOKEN_REFRESH_MARGIN_MS,
} from '@adapter/outbound/push/push-access-token.cache';
import type { PushCredentials } from '@adapter/outbound/push/push-credentials';
import { FixedClock } from '../../../../support/fakes/fixed-clock';

const now = new Date('2026-09-18T10:00:00.000Z');

let credentials: PushCredentials;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });

  credentials = {
    issuer: 'push@service.invalid',
    privateKey: await exportPKCS8(pair.privateKey),
    tokenEndpoint: 'https://exchange.invalid/token',
  };
});

/** One exchange endpoint, answering what the test queued and keeping what it was sent. */
class ScriptedExchange {
  readonly calls: { url: string; body: string }[] = [];
  answers: { status: number; body: unknown }[] = [];

  readonly fetch: typeof fetch = async (input, init) => {
    this.calls.push({ url: String(input), body: String(init?.body ?? '') });

    const answer = this.answers.shift() ?? {
      status: 200,
      body: { access_token: 'granted', expires_in: 3600 },
    };

    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { 'content-type': 'application/json' },
    });
  };
}

let exchange: ScriptedExchange;
let clock: FixedClock;

beforeEach(() => {
  exchange = new ScriptedExchange();
  clock = new FixedClock(now);
});

const cache = (): PushAccessTokenCache =>
  new PushAccessTokenCache('https://push.invalid/auth', clock, exchange.fetch);

describe('the push access token', () => {
  it('exchanges a signed assertion for a bearer token', async () => {
    expect(await cache().token(credentials)).toBe('granted');

    expect(exchange.calls).toHaveLength(1);
    expect(exchange.calls[0]?.url).toBe('https://exchange.invalid/token');
    expect(exchange.calls[0]?.body).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth');
    expect(exchange.calls[0]?.body).toContain('assertion=');
  });

  // A notification goes to every approved device: exchanging per message would put a round trip
  // in front of each one, in the path that is already racing a deadline.
  it('keeps the token until it is nearly due', async () => {
    const held = cache();

    await held.token(credentials);
    clock.advance(3600_000 - TOKEN_REFRESH_MARGIN_MS - 1000);
    await held.token(credentials);

    expect(exchange.calls).toHaveLength(1);
  });

  it('exchanges again once the margin is reached', async () => {
    const held = cache();

    await held.token(credentials);
    clock.advance(3600_000 - TOKEN_REFRESH_MARGIN_MS + 1);
    await held.token(credentials);

    expect(exchange.calls).toHaveLength(2);
  });

  // Some providers treat a burst of exchanges as abuse, and a fan-out to five devices is a burst.
  it('shares one exchange between callers that asked at the same moment', async () => {
    const held = cache();

    await Promise.all([held.token(credentials), held.token(credentials), held.token(credentials)]);

    expect(exchange.calls).toHaveLength(1);
  });

  it('exchanges again after the held token is dropped', async () => {
    const held = cache();
    await held.token(credentials);

    held.forget();
    await held.token(credentials);

    expect(exchange.calls).toHaveLength(2);
  });

  it('refuses when the exchange answers a failure', async () => {
    exchange.answers = [{ status: 403, body: {} }];

    await expect(cache().token(credentials)).rejects.toThrow(PushAuthorizationFailedError);
  });

  it('refuses when the exchange answers a body it cannot use', async () => {
    exchange.answers = [{ status: 200, body: { nothing: 'useful' } }];

    await expect(cache().token(credentials)).rejects.toThrow(/unusable body/);
  });

  it('refuses when the key cannot sign, and says nothing about the key', async () => {
    const unusable = { ...credentials, privateKey: 'not a key' };

    await expect(cache().token(unusable)).rejects.toThrow(PushAuthorizationFailedError);
    await expect(cache().token(unusable)).rejects.toThrow(/could not be used to sign/);
  });

  it('tries again after a failure rather than holding on to it', async () => {
    const held = cache();
    exchange.answers = [{ status: 500, body: {} }];

    await expect(held.token(credentials)).rejects.toThrow(PushAuthorizationFailedError);

    expect(await held.token(credentials)).toBe('granted');
  });
});
