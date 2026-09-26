import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

import { environment } from '../fixtures/environment';

/**
 * S-19 — no route answers `200` with an error in the body.
 *
 * The integration suite proves each handler maps its own error to a status. What it cannot prove
 * is the statement about **every** route, because it never sees the assembled application: a
 * middleware that swallows a rejection, or a filter that is registered in `main.ts` and nowhere
 * else, turns a `4xx` into a `200` and no unit test notices. This spec asks the running server.
 *
 * See docs/architecture/shared/04-errors-and-http.md.
 */

/** The envelope every refusal carries — the same shape the WebSocket `error` frame uses. */
interface ErrorBody {
  readonly error?: {
    readonly code?: unknown;
    readonly messageKey?: unknown;
    readonly traceId?: unknown;
    readonly httpEquivalent?: unknown;
  };
  readonly stack?: unknown;
}

/** Calls that must be refused, and the status each one owes. */
const REFUSALS = [
  {
    what: 'a refresh with no cookie',
    status: 401,
    code: 'UNAUTHENTICATED',
    call: (api: APIRequestContext) => api.post(`${environment.backendUrl}/auth/refresh`),
  },
  {
    what: 'a session exchange with a body that is not one',
    status: 400,
    code: 'INVALID_INPUT',
    call: (api: APIRequestContext) =>
      api.post(`${environment.backendUrl}/auth/session`, { data: { code: '' } }),
  },
  {
    what: 'a permission revalidation with no credential',
    status: 401,
    code: 'UNAUTHENTICATED',
    call: (api: APIRequestContext) =>
      api.get(`${environment.backendUrl}/sessions/01J0ABCDEFGHJKMNPQRSTVWXYZ/permissions/req-1`),
  },
  {
    what: 'a history listing with no credential',
    status: 401,
    code: 'UNAUTHENTICATED',
    call: (api: APIRequestContext) =>
      api.get(`${environment.backendUrl}/transcripts?workspacePath=/srv`),
  },
  {
    what: 'a page of history with no credential',
    status: 401,
    code: 'UNAUTHENTICATED',
    call: (api: APIRequestContext) =>
      api.get(
        `${environment.backendUrl}/transcripts/6b41b192-a41b-46c2-b8d7-5098d8c825be/messages`,
      ),
  },
  {
    what: 'a route that does not exist',
    status: 404,
    code: 'NOT_FOUND',
    call: (api: APIRequestContext) => api.get(`${environment.backendUrl}/nothing-here`),
  },
] as const;

test.describe('S-19 — the status line carries the outcome, never the body alone', () => {
  for (const refusal of REFUSALS) {
    test(`${refusal.what} is refused with ${String(refusal.status)}`, async ({ request }) => {
      const response = await refusal.call(request);

      expect(response.status()).toBe(refusal.status);

      const body = (await response.json()) as ErrorBody;
      expect(body.error?.code).toBe(refusal.code);

      // The status line and the body agree; a client that reads only one of them is never misled.
      expect(body.error?.httpEquivalent).toBe(refusal.status);

      // A client translates `messageKey`; it never shows what the server wrote in English.
      expect(body.error?.messageKey).toEqual(expect.any(String));
      expect(body.error?.traceId).toEqual(expect.any(String));

      // S-15, from the outside: nothing of the server's insides travels with the refusal.
      expect(body.stack).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain('/backend/src');
    });
  }

  test('the health route answers 200 only while it is actually healthy', async ({ request }) => {
    const response = await request.get(`${environment.backendUrl}/health`);
    const report = (await response.json()) as { status: string };

    expect(response.status()).toBe(200);
    expect(report.status).toBe('up');
  });

  test('the trace id a caller sends is the one that comes back', async ({ request }) => {
    const traceId = '01JBOOTSTRAPE2ETRACE000001';
    const response = await request.get(`${environment.backendUrl}/health`, {
      headers: { 'x-trace-id': traceId },
    });

    expect(response.headers()['x-trace-id']).toBe(traceId);
  });
});
