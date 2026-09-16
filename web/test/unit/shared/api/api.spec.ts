import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClient, anonymous } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import type { Credentials } from '@/shared/api/api';

const BASE = 'http://backend.test';

/** The last request the client made. */
function requestOf(fetchMock: ReturnType<typeof vi.fn>, index = 0): RequestInit {
  return (fetchMock.mock.calls[index]?.[1] ?? {}) as RequestInit;
}

function headersOf(fetchMock: ReturnType<typeof vi.fn>, index = 0): Record<string, string> {
  return (requestOf(fetchMock, index).headers ?? {}) as Record<string, string>;
}

describe('ApiClient', () => {
  let http: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // A fresh Response per call: a body can only be read once, and several of these tests call
    // the client twice.
    http = vi.fn(() => Promise.resolve(Response.json({ ok: true })));
  });

  it('sends the path against the configured base url', async () => {
    await new ApiClient(BASE, anonymous, http as unknown as typeof fetch).get('/health');

    expect(http.mock.calls[0]?.[0]).toBe(`${BASE}/health`);
  });

  it('gives every request its own trace', async () => {
    const client = new ApiClient(BASE, anonymous, http as unknown as typeof fetch);

    await client.get('/health');
    await client.get('/health');

    expect(headersOf(http, 0)['x-trace-id']).not.toBe(headersOf(http, 1)['x-trace-id']);
  });

  it('asks for the caller’s language', async () => {
    await new ApiClient(BASE, anonymous, http as unknown as typeof fetch).get('/health', {
      locale: 'pt-BR',
    });

    expect(headersOf(http)['accept-language']).toBe('pt-BR');
  });

  it('attaches the credential when there is one', async () => {
    const credentials: Credentials = { accessToken: () => 'token-1', renew: async () => null };

    await new ApiClient(BASE, credentials, http as unknown as typeof fetch).get('/sessions');

    expect(headersOf(http)['authorization']).toBe('Bearer token-1');
  });

  it('sends no Authorization header while nobody is signed in', async () => {
    await new ApiClient(BASE, anonymous, http as unknown as typeof fetch).get('/health');

    expect(headersOf(http)['authorization']).toBeUndefined();
  });

  it('serialises a body and says it is JSON', async () => {
    await new ApiClient(BASE, anonymous, http as unknown as typeof fetch).post('/auth/session', {
      code: 'c',
    });

    expect(requestOf(http).body).toBe('{"code":"c"}');
    expect(headersOf(http)['content-type']).toBe('application/json');
  });

  it('sends the cookie, which is where the refresh token lives', async () => {
    await new ApiClient(BASE, anonymous, http as unknown as typeof fetch).post(
      '/auth/refresh',
      undefined,
    );

    expect(requestOf(http).credentials).toBe('include');
  });

  it('answers the parsed body', async () => {
    await expect(
      new ApiClient(BASE, anonymous, http as unknown as typeof fetch).get<{ ok: boolean }>(
        '/health',
      ),
    ).resolves.toEqual({ ok: true });
  });

  it('answers nothing for a 204', async () => {
    http.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      new ApiClient(BASE, anonymous, http as unknown as typeof fetch).post(
        '/auth/logout',
        undefined,
      ),
    ).resolves.toBeUndefined();
  });

  it('turns an error response into an AppError', async () => {
    http.mockResolvedValue(
      Response.json(
        {
          error: { code: 'SESSION_NOT_FOUND', messageKey: 'session.error.notFound', traceId: 't' },
        },
        { status: 404 },
      ),
    );

    await expect(
      new ApiClient(BASE, anonymous, http as unknown as typeof fetch).get('/sessions/1'),
    ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  it('turns a network failure into an AppError too, never a raw TypeError', async () => {
    http.mockRejectedValue(new TypeError('failed to fetch'));

    await expect(
      new ApiClient(BASE, anonymous, http as unknown as typeof fetch).get('/health'),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('renews once on a 401 and repeats the request', async () => {
    const renew = vi.fn().mockResolvedValue('token-2');
    http
      .mockResolvedValueOnce(Response.json({ error: {} }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));

    const client = new ApiClient(
      BASE,
      { accessToken: () => 't', renew },
      http as unknown as typeof fetch,
    );

    await expect(client.get('/sessions')).resolves.toEqual({ ok: true });
    expect(renew).toHaveBeenCalledTimes(1);
    expect(http).toHaveBeenCalledTimes(2);
  });

  it('does not loop when the second attempt is a 401 as well', async () => {
    const renew = vi.fn().mockResolvedValue('token-2');
    http.mockImplementation(() => Promise.resolve(Response.json({ error: {} }, { status: 401 })));

    const client = new ApiClient(
      BASE,
      { accessToken: () => 't', renew },
      http as unknown as typeof fetch,
    );

    await expect(client.get('/sessions')).rejects.toBeInstanceOf(AppError);
    expect(http).toHaveBeenCalledTimes(2);
  });

  it('gives up without retrying when renewal fails', async () => {
    http.mockImplementation(() => Promise.resolve(Response.json({ error: {} }, { status: 401 })));

    const client = new ApiClient(
      BASE,
      { accessToken: () => 't', renew: async () => null },
      http as unknown as typeof fetch,
    );

    await expect(client.get('/sessions')).rejects.toBeInstanceOf(AppError);
    expect(http).toHaveBeenCalledTimes(1);
  });

  it.each([403, 404, 500])('never repeats a %i — the answer would not change', async (status) => {
    http.mockImplementation(() => Promise.resolve(Response.json({ error: {} }, { status })));

    const client = new ApiClient(BASE, anonymous, http as unknown as typeof fetch);

    await expect(client.get('/sessions')).rejects.toBeInstanceOf(AppError);
    expect(http).toHaveBeenCalledTimes(1);
  });

  it('honours a caller’s own abort signal instead of imposing its deadline', async () => {
    const controller = new AbortController();

    await new ApiClient(BASE, anonymous, http as unknown as typeof fetch).request('/health', {
      signal: controller.signal,
    });

    expect(requestOf(http).signal).toBe(controller.signal);
  });

  it('defaults to GET when the caller names no method', async () => {
    await new ApiClient(BASE, anonymous, http as unknown as typeof fetch).request('/health');

    expect(requestOf(http).method).toBe('GET');
  });

  it('answers nothing for an empty body', async () => {
    http.mockImplementation(() => Promise.resolve(new Response('', { status: 200 })));

    await expect(
      new ApiClient(BASE, anonymous, http as unknown as typeof fetch).get('/health'),
    ).resolves.toBeUndefined();
  });

  it('still produces an AppError when a proxy answers HTML instead of JSON', async () => {
    http.mockImplementation(() =>
      Promise.resolve(new Response('<html>502 Bad Gateway</html>', { status: 502 })),
    );

    await expect(
      new ApiClient(BASE, anonymous, http as unknown as typeof fetch).get('/health'),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('can be handed a credential source after it was built', async () => {
    const client = new ApiClient(BASE, anonymous, http as unknown as typeof fetch);

    client.useCredentials({ accessToken: () => 'later', renew: async () => null });
    await client.get('/sessions');

    expect(headersOf(http)['authorization']).toBe('Bearer later');
  });
});

describe('the transport it reaches for when nobody injected one', () => {
  it('calls fetch with the global as its receiver, never with the client', async () => {
    const receivers: unknown[] = [];

    vi.stubGlobal('fetch', function (this: unknown): Promise<Response> {
      receivers.push(this);
      return Promise.resolve(Response.json({ ok: true }));
    });

    // A bare `= fetch` default is invoked as `this.http(...)`, which makes the client the
    // receiver — and a real browser answers that with "Illegal invocation" before a byte leaves
    // the machine. jsdom is forgiving enough not to throw, so what is asserted is the receiver.
    await new ApiClient(BASE).get('/health');

    expect(receivers).toEqual([globalThis]);
    vi.unstubAllGlobals();
  });
});

describe('a request the caller marked non-renewable', () => {
  it('is not retried after a 401, and the renewal is never asked for', async () => {
    const renew = vi.fn(() => Promise.resolve('fresh'));
    const credentials: Credentials = { accessToken: () => 'stale', renew };
    const unauthorised = vi.fn(() =>
      Promise.resolve(Response.json({ error: {} }, { status: 401 })),
    );

    const client = new ApiClient(BASE, credentials, unauthorised as unknown as typeof fetch);

    await expect(
      client.post('/auth/refresh', undefined, { renewable: false }),
    ).rejects.toBeInstanceOf(AppError);

    // Renewal is itself a request. Letting `/auth/refresh` renew would make it wait on the promise
    // it is part of, and the caller would never hear back at all.
    expect(unauthorised).toHaveBeenCalledTimes(1);
    expect(renew).not.toHaveBeenCalled();
  });

  it('still renews for every other call, which is what the retry is for', async () => {
    const renew = vi.fn(() => Promise.resolve('fresh'));
    const credentials: Credentials = { accessToken: () => 'stale', renew };
    let calls = 0;
    const once = vi.fn(() => {
      calls += 1;
      return Promise.resolve(
        calls === 1 ? Response.json({ error: {} }, { status: 401 }) : Response.json({ ok: true }),
      );
    });

    const client = new ApiClient(BASE, credentials, once as unknown as typeof fetch);

    await expect(client.get('/sessions')).resolves.toEqual({ ok: true });
    expect(renew).toHaveBeenCalledTimes(1);
  });
});
