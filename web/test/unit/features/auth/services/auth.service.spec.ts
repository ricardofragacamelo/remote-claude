import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CALLBACK_PATH,
  beginLogin,
  completeLogin,
  discover,
  endSession,
  redirectUri,
  renewSession,
  returnRoute,
} from '@/features/auth/services/auth.service';
import { AppError } from '@/shared/api/errors';
import { api } from '@/shared/api/api';

const ISSUER = 'http://localhost:8180/realms/remote-claude';

const discovery = {
  authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
  end_session_endpoint: `${ISSUER}/protocol/openid-connect/logout`,
};

/** An in-memory `Storage`, so the test never depends on the one jsdom happens to provide. */
function memoryStorage(): Storage {
  const entries = new Map<string, string>();

  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => entries.delete(key),
    setItem: (key, value) => entries.set(key, value),
  } as Storage;
}

describe('discover', () => {
  it('reads the endpoints instead of having them written by hand', async () => {
    const http = vi.fn().mockResolvedValue(Response.json(discovery));

    await expect(discover(ISSUER, http as unknown as typeof fetch)).resolves.toEqual({
      authorizationEndpoint: discovery.authorization_endpoint,
      endSessionEndpoint: discovery.end_session_endpoint,
    });
  });

  it('tolerates an issuer written with a trailing slash', async () => {
    const http = vi.fn().mockResolvedValue(Response.json(discovery));

    await discover(`${ISSUER}/`, http as unknown as typeof fetch);

    expect(http.mock.calls[0]?.[0]).toBe(`${ISSUER}/.well-known/openid-configuration`);
  });

  it('reports no logout endpoint when the provider publishes none', async () => {
    const http = vi.fn().mockResolvedValue(Response.json({ authorization_endpoint: 'http://a/b' }));

    await expect(discover(ISSUER, http as unknown as typeof fetch)).resolves.toMatchObject({
      endSessionEndpoint: null,
    });
  });

  it.each([
    ['the provider is down', () => Promise.resolve(Response.json({}, { status: 503 }))],
    ['the document is unusable', () => Promise.resolve(Response.json({ nothing: true }))],
  ])('fails with an AppError when %s', async (_case, answer) => {
    await expect(discover(ISSUER, answer as unknown as typeof fetch)).rejects.toBeInstanceOf(
      AppError,
    );
  });
});

describe('beginLogin', () => {
  let storage: Storage;
  let http: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storage = memoryStorage();
    http = vi.fn(() => Promise.resolve(Response.json(discovery)));
  });

  it('sends the browser to the discovered authorization endpoint', async () => {
    const url = new URL(await beginLogin('/', storage, http as unknown as typeof fetch));

    expect(`${url.origin}${url.pathname}`).toBe(discovery.authorization_endpoint);
  });

  it('asks for a code, with a challenge derived by S256', async () => {
    const url = new URL(await beginLogin('/', storage, http as unknown as typeof fetch));

    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toHaveLength(43);
  });

  it('never puts the verifier in the request it publishes', async () => {
    const url = await beginLogin('/', storage, http as unknown as typeof fetch);

    expect(url).not.toContain(storage.getItem('rc.pkce.verifier'));
  });

  it('carries a state the callback can check', async () => {
    const url = new URL(await beginLogin('/', storage, http as unknown as typeof fetch));

    expect(url.searchParams.get('state')).toBe(storage.getItem('rc.pkce.state'));
  });

  it('draws a fresh state every time', async () => {
    const first = new URL(await beginLogin('/', storage, http as unknown as typeof fetch));
    const second = new URL(await beginLogin('/', storage, http as unknown as typeof fetch));

    expect(first.searchParams.get('state')).not.toBe(second.searchParams.get('state'));
  });

  it('remembers where to come back to', async () => {
    await beginLogin('/sessions/01J0', storage, http as unknown as typeof fetch);

    expect(returnRoute(storage)).toBe('/sessions/01J0');
  });

  it('comes back to the root when nothing was remembered', () => {
    expect(returnRoute(memoryStorage())).toBe('/');
  });

  it('tells the provider the redirect it will use', async () => {
    const url = new URL(await beginLogin('/', storage, http as unknown as typeof fetch));

    expect(url.searchParams.get('redirect_uri')).toBe(redirectUri());
    expect(redirectUri().endsWith(CALLBACK_PATH)).toBe(true);
  });
});

/** Replaces the one HTTP client's `post`, and answers the spy so a test can read the call. */
function stubPost(): ReturnType<typeof vi.spyOn> {
  const spy = vi.spyOn(api, 'post');
  spy.mockResolvedValue({ accessToken: 'a', expiresInSeconds: 900, userId: 'auth|42' });
  return spy as unknown as ReturnType<typeof vi.spyOn>;
}

describe('completeLogin', () => {
  let storage: Storage;
  let post: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    storage = memoryStorage();
    storage.setItem('rc.pkce.state', 'state-1');
    storage.setItem('rc.pkce.verifier', 'verifier-1');
    post = stubPost();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exchanges the code and reports who it belongs to', async () => {
    const session = await completeLogin(
      new URLSearchParams({ code: 'c', state: 'state-1' }),
      storage,
    );

    expect(session.accessToken).toBe('a');
    expect(session.userId).toBe('auth|42');
    expect(session.expiresAt).toBeGreaterThan(Date.now());
  });

  it('hands the verifier to the backend, which is the half a browser cannot keep', async () => {
    await completeLogin(new URLSearchParams({ code: 'c', state: 'state-1' }), storage);

    expect(post.mock.calls[0]?.[1]).toMatchObject({ code: 'c', codeVerifier: 'verifier-1' });
  });

  it.each([
    ['the state does not match', { code: 'c', state: 'somebody-elses' }],
    ['there is no state at all', { code: 'c' }],
    ['there is no code', { state: 'state-1' }],
  ])('refuses the callback when %s, without exchanging anything', async (_case, params) => {
    await expect(completeLogin(new URLSearchParams(params), storage)).rejects.toMatchObject({
      messageKey: 'auth.error.invalidState',
    });

    expect(post).not.toHaveBeenCalled();
  });

  it('refuses when the request was never started from this browser', async () => {
    await expect(
      completeLogin(new URLSearchParams({ code: 'c', state: 's' }), memoryStorage()),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('uses the verifier once and then removes it, whatever the outcome', async () => {
    await completeLogin(new URLSearchParams({ code: 'c', state: 'state-1' }), storage).catch(
      () => undefined,
    );

    expect(storage.getItem('rc.pkce.verifier')).toBeNull();
    expect(storage.getItem('rc.pkce.state')).toBeNull();
  });

  it('exchanges once when the same callback is completed twice at the same time', async () => {
    const params = new URLSearchParams({ code: 'c', state: 'state-1' });

    // The screen mounting twice is not hypothetical: React's development double-effect does it on
    // every callback. The second call must not find the state already consumed and refuse a login
    // that in fact worked.
    const [first, second] = await Promise.all([
      completeLogin(params, storage),
      completeLogin(params, storage),
    ]);

    expect(post).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('forgets a finished exchange, so a later callback is never served a stale session', async () => {
    await completeLogin(new URLSearchParams({ code: 'c', state: 'state-1' }), storage);

    storage.setItem('rc.pkce.state', 'state-2');
    storage.setItem('rc.pkce.verifier', 'verifier-2');
    await completeLogin(new URLSearchParams({ code: 'c', state: 'state-2' }), storage);

    expect(post).toHaveBeenCalledTimes(2);
  });
});

describe('renewSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers the rotated credential', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      accessToken: 'a2',
      expiresInSeconds: 900,
      userId: 'auth|42',
    });

    await expect(renewSession()).resolves.toMatchObject({ accessToken: 'a2' });
  });

  it('makes one call when several callers ask at once', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ accessToken: 'a2', expiresInSeconds: 900, userId: 'auth|42' }),
              5,
            ),
          ),
      );

    await Promise.all([renewSession(), renewSession(), renewSession()]);

    // A refresh token used twice looks like a leak, and the provider revokes the family.
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('lets the next caller try again after a renewal finished', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      accessToken: 'a2',
      expiresInSeconds: 900,
      userId: 'auth|42',
    });

    await renewSession();
    await renewSession();

    expect(post).toHaveBeenCalledTimes(2);
  });

  it('lets the next caller try again after a renewal failed', async () => {
    const post = vi.spyOn(api, 'post').mockRejectedValue(new AppError('X', 'k', 't'));

    await expect(renewSession()).rejects.toBeInstanceOf(AppError);
    await expect(renewSession()).rejects.toBeInstanceOf(AppError);
    expect(post).toHaveBeenCalledTimes(2);
  });
});

describe('endSession', () => {
  it('asks the backend to drop the refresh cookie', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(undefined);

    await endSession();

    expect(post).toHaveBeenCalledWith('/auth/logout', undefined, { renewable: false });
    post.mockRestore();
  });
});

/** A storage holding the state and verifier a started sign-in would have left in it. */
function started(): Storage {
  const storage = memoryStorage();
  storage.setItem('rc.pkce.state', 's');
  storage.setItem('rc.pkce.verifier', 'v');
  return storage;
}

describe('the sign-in calls are never retried by renewing', () => {
  // Renewal is itself a request. A `401` on `/auth/refresh` that triggered a renewal would wait on
  // the promise it is part of, and the screen would sit on its loading state for ever — no error,
  // nothing in the log, and no way to tell it apart from a slow network.
  it.each([
    [
      'the exchange',
      () => completeLogin(new URLSearchParams({ code: 'c', state: 's' }), started()),
    ],
    ['the renewal', () => renewSession()],
    ['the logout', () => endSession()],
  ])('marks %s non-renewable', async (_case, call) => {
    const post = vi.spyOn(api, 'post');
    post.mockResolvedValue({ accessToken: 'a', userId: 'auth|42', expiresInSeconds: 300 });

    await call();

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[2]).toMatchObject({ renewable: false });

    post.mockRestore();
  });
});
