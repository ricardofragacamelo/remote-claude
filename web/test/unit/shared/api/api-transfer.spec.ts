import { describe, expect, it, vi } from 'vitest';

import { ApiClient, TRANSFER_TIMEOUT_MS, anonymous } from '@/shared/api/api';
import type { Credentials } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';

const BASE = 'http://backend.test';

const signedIn: Credentials = { accessToken: () => 'token-1', renew: () => Promise.resolve(null) };

/** An XMLHttpRequest that answers when the test says. */
class FakeXhr {
  method = '';
  url = '';
  headers: Record<string, string> = {};
  withCredentials = false;
  timeout = 0;
  status = 0;
  responseText = '';
  sent: unknown = undefined;
  aborted = false;
  readonly upload: { onprogress: ((event: { loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  send(body: unknown): void {
    this.sent = body;
  }

  abort(): void {
    this.aborted = true;
    this.onabort?.();
  }

  respond(status: number, text: string): void {
    this.status = status;
    this.responseText = text;
    this.onload?.();
  }
}

function xhrs(): { made: FakeXhr[]; factory: () => XMLHttpRequest } {
  const made: FakeXhr[] = [];
  return {
    made,
    factory: () => {
      const xhr = new FakeXhr();
      made.push(xhr);
      return xhr as unknown as XMLHttpRequest;
    },
  };
}

/** Lets the promise chain of the client reach the request it is about to send. */
async function settled(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('reading bytes — plan 07 · F7', () => {
  it('sends the credential in the header, never in the URL, and answers the bytes with their headers', async () => {
    const http = vi.fn(() =>
      Promise.resolve(
        new Response('abc', {
          status: 206,
          headers: { etag: '"v1"', 'content-range': 'bytes 0-2/10' },
        }),
      ),
    );
    const client = new ApiClient(BASE, signedIn, http as unknown as typeof fetch);

    const answer = await client.bytes('/files/raw?folder=%2Fr&path=a.bin', {
      headers: { range: 'bytes=0-2' },
    });

    const [url, init] = http.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe(`${BASE}/files/raw?folder=%2Fr&path=a.bin`);
    expect(url).not.toMatch(/token/);
    expect(headers['authorization']).toBe('Bearer token-1');
    expect(headers['accept']).toBe('*/*');
    expect(headers['range']).toBe('bytes=0-2');
    expect(answer.status).toBe(206);
    expect(await answer.blob.text()).toBe('abc');
    expect(answer.header('etag')).toBe('"v1"');
    expect(answer.header('content-range')).toBe('bytes 0-2/10');
  });

  it('turns the envelope of a refusal into an AppError — 416, 412, 413', async () => {
    const http = vi.fn(() =>
      Promise.resolve(
        Response.json(
          {
            error: {
              code: 'RANGE_NOT_SATISFIABLE',
              messageKey: 'files.error.rangeNotSatisfiable',
              params: { size: 0 },
            },
          },
          { status: 416 },
        ),
      ),
    );

    await expect(
      new ApiClient(BASE, anonymous, http as unknown as typeof fetch).bytes('/files/raw'),
    ).rejects.toMatchObject({ code: 'RANGE_NOT_SATISFIABLE', params: { size: 0 } });
  });

  it('is a transport failure when the body is cut in the middle', async () => {
    const cut = { ok: true, status: 200, blob: () => Promise.reject(new TypeError('terminated')) };
    const http = vi.fn(() => Promise.resolve(cut));

    const failure = await new ApiClient(BASE, anonymous, http as unknown as typeof fetch)
      .bytes('/files/archive')
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect((failure as AppError).code).toBe('NETWORK_UNREACHABLE');
  });

  it('keeps the caller’s signal and a deadline of its own', async () => {
    const controller = new AbortController();
    const http = vi.fn((_url: string, init: RequestInit) => {
      controller.abort();
      return Promise.resolve(
        new Response(init.signal?.aborted === true ? 'aborted' : 'live', { status: 200 }),
      );
    });

    const answer = await new ApiClient(BASE, anonymous, http as unknown as typeof fetch).bytes(
      '/files/raw',
      { signal: controller.signal },
    );

    expect(await answer.blob.text()).toBe('aborted');
  });
});

describe('uploading a form — plan 07 · F7', () => {
  it('sends the form with the credential, the trace and the language, and reports its progress', async () => {
    const { made, factory } = xhrs();
    const client = new ApiClient(BASE, signedIn, undefined, factory);
    const progress = vi.fn();
    const form = new FormData();

    const sent = client.upload('/files/upload', form, { locale: 'pt-BR', onProgress: progress });
    const xhr = made[0] as FakeXhr;

    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe(`${BASE}/files/upload`);
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.timeout).toBe(TRANSFER_TIMEOUT_MS);
    expect(xhr.headers['authorization']).toBe('Bearer token-1');
    expect(xhr.headers['accept-language']).toBe('pt-BR');
    expect(xhr.headers['x-trace-id']).toMatch(/.+/);
    expect(xhr.sent).toBe(form);

    xhr.upload.onprogress?.({ loaded: 5, total: 10 });
    expect(progress).toHaveBeenCalledWith(5, 10);

    xhr.respond(207, '{"items":[]}');
    await expect(sent).resolves.toEqual({ status: 207, body: { items: [] } });
  });

  it('sends no credential while nobody is signed in, and an empty answer is no body', async () => {
    const { made, factory } = xhrs();
    const sent = new ApiClient(BASE, anonymous, undefined, factory).upload(
      '/files/upload',
      new FormData(),
    );
    const xhr = made[0] as FakeXhr;

    expect(xhr.headers['authorization']).toBeUndefined();
    expect(xhr.headers['accept-language']).toBe('en');
    xhr.upload.onprogress?.({ loaded: 1, total: 1 });
    xhr.respond(200, '');
    await expect(sent).resolves.toEqual({ status: 200, body: undefined });
  });

  it('turns a refusal into an AppError', async () => {
    const { made, factory } = xhrs();
    const sent = new ApiClient(BASE, signedIn, undefined, factory).upload(
      '/files/upload',
      new FormData(),
    );

    (made[0] as FakeXhr).respond(
      413,
      '{"error":{"code":"FILE_TOO_LARGE","messageKey":"files.error.tooLarge","params":{"limit":5}}}',
    );
    await expect(sent).rejects.toMatchObject({ code: 'FILE_TOO_LARGE', params: { limit: 5 } });
  });

  it('renews once on a 401 and sends again — and gives up when renewal fails', async () => {
    const { made, factory } = xhrs();
    let token = 'stale';
    const renew = vi.fn(() => {
      token = 'fresh';
      return Promise.resolve('fresh');
    });
    const client = new ApiClient(BASE, { accessToken: () => token, renew }, undefined, factory);

    const sent = client.upload('/files/upload', new FormData());
    (made[0] as FakeXhr).respond(401, '');
    await settled();
    expect(made[1]?.headers['authorization']).toBe('Bearer fresh');
    (made[1] as FakeXhr).respond(200, '{"items":[]}');
    await expect(sent).resolves.toMatchObject({ status: 200 });

    const failing = new ApiClient(BASE, signedIn, undefined, factory).upload(
      '/files/upload',
      new FormData(),
    );
    (made[2] as FakeXhr).respond(401, '{"error":{"code":"UNAUTHORIZED","messageKey":"auth.x"}}');
    await expect(failing).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(made).toHaveLength(3);
  });

  it.each(['onerror', 'ontimeout'] as const)(
    'is a transport failure when the connection fails (%s)',
    async (event) => {
      const { made, factory } = xhrs();
      const sent = new ApiClient(BASE, anonymous, undefined, factory).upload(
        '/files/upload',
        new FormData(),
      );

      (made[0] as FakeXhr)[event]?.();
      await expect(sent).rejects.toMatchObject({ code: 'NETWORK_UNREACHABLE' });
    },
  );

  it('aborts the request when the person cancels, and sends nothing once cancelled', async () => {
    const { made, factory } = xhrs();
    const client = new ApiClient(BASE, anonymous, undefined, factory);
    const controller = new AbortController();

    const sent = client.upload('/files/upload', new FormData(), { signal: controller.signal });
    controller.abort();
    await expect(sent).rejects.toMatchObject({ code: 'NETWORK_UNREACHABLE' });
    expect(made[0]?.aborted).toBe(true);

    const late = client.upload('/files/upload', new FormData(), { signal: controller.signal });
    await expect(late).rejects.toMatchObject({ code: 'NETWORK_UNREACHABLE' });
    expect(made[1]?.sent).toBeUndefined();
  });

  it('reaches for the browser’s XMLHttpRequest when nobody injected one', async () => {
    const { made, factory } = xhrs();
    vi.stubGlobal(
      'XMLHttpRequest',
      vi.fn(function Made() {
        return factory();
      }),
    );

    const sent = new ApiClient(BASE).upload('/files/upload', new FormData());
    (made[0] as FakeXhr).respond(200, '{}');
    await expect(sent).resolves.toEqual({ status: 200, body: {} });
    vi.unstubAllGlobals();
  });
});
