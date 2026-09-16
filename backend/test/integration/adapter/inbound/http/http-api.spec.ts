import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { CheckHealthUseCase } from '@application/health';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';

/** A `set-cookie` header, as a single string. */
function setCookie(headers: Record<string, unknown>): string {
  const raw = headers['set-cookie'];
  return Array.isArray(raw) ? raw.join('; ') : String(raw ?? '');
}

describe('the HTTP surface', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    harness = await startTestApp(database.url, identity);
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  beforeEach(() => {
    harness.log.lines.length = 0;
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());

  /** Queues a successful token response signed by the fake provider. */
  async function queueTokens(refreshToken: string | null = 'r1'): Promise<void> {
    identity.answerToken({
      status: 200,
      body: {
        access_token: await identity.accessToken({ subject: 'auth|42' }),
        ...(refreshToken === null ? {} : { refresh_token: refreshToken }),
        expires_in: 900,
      },
    });
  }

  describe('GET /health', () => {
    it('answers 200 without any credential', async () => {
      const response = await http().get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'up', database: 'up' });
    });

    it('answers 503 with a Retry-After when the database is unreachable', async () => {
      const down = await startTestApp(database.url, identity, (builder) =>
        builder.overrideProvider(CheckHealthUseCase).useValue({
          execute: () => Promise.resolve({ status: 'down', database: 'down' }),
        }),
      );

      const response = await request(down.app.getHttpServer()).get('/health');

      expect(response.status).toBe(503);
      expect(response.headers['retry-after']).toBe('5');
      await down.close();
    });
  });

  describe('the error envelope', () => {
    it('answers an unknown route with the same envelope every other failure uses', async () => {
      const response = await http().get('/nothing-here');

      expect(response.status).toBe(404);
      expect(response.body.error).toMatchObject({
        code: 'NOT_FOUND',
        messageKey: 'common.error.notFound',
        httpEquivalent: 404,
      });
      expect(response.body.error.traceId).toEqual(expect.any(String));
    });

    it('never puts a stack or a server path in the body', async () => {
      const response = await http().get('/nothing-here');

      expect(JSON.stringify(response.body)).not.toContain('stack');
      expect(JSON.stringify(response.body)).not.toContain('/src/');
    });

    it('answers 400 INVALID_INPUT for a malformed payload', async () => {
      const response = await http().post('/auth/session').send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });

    it('lists every invalid field at once, not just the first', async () => {
      const response = await http().post('/auth/session').send({ codeVerifier: 'short' });

      expect(
        (response.body.error.details as { field: string }[]).map((detail) => detail.field).sort(),
      ).toEqual(['code', 'codeVerifier', 'redirectUri']);
    });

    it('answers 500 INTERNAL_ERROR without leaking the internal message', async () => {
      const broken = await startTestApp(database.url, identity, (builder) =>
        builder.overrideProvider(CheckHealthUseCase).useValue({
          execute: () => Promise.reject(new Error('ENOENT /srv/remote-claude/secret.key')),
        }),
      );

      const response = await request(broken.app.getHttpServer()).get('/health');

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(response.body)).not.toContain('secret.key');
      await broken.close();
    });

    it('never answers 200 with an error inside the body', async () => {
      for (const path of ['/health', '/nothing-here']) {
        const response = await http().get(path);

        expect(response.status === 200 && 'error' in response.body).toBe(false);
      }
    });
  });

  describe('the trace', () => {
    it('echoes the trace it was given, and uses it in both halves of the log', async () => {
      const response = await http().get('/health').set('x-trace-id', 'trace-given');

      expect(response.headers['x-trace-id']).toBe('trace-given');
      expect(harness.log.withOp('http.request')[0]?.['traceId']).toBe('trace-given');
      expect(harness.log.withOp('http.response')[0]?.['traceId']).toBe('trace-given');
    });

    it('mints one when the caller sent none, and returns it', async () => {
      const response = await http().get('/health');

      expect(String(response.headers['x-trace-id'])).toHaveLength(26);
    });

    it('reports how long the response took', async () => {
      await http().get('/health');

      expect(harness.log.withOp('http.response')[0]).toMatchObject({
        durationMs: expect.any(Number),
        httpStatus: 200,
      });
    });

    it('does not let two concurrent requests borrow each other’s trace', async () => {
      await Promise.all([
        http().get('/health').set('x-trace-id', 'trace-a'),
        http().get('/nothing-here').set('x-trace-id', 'trace-b'),
      ]);

      const responses = harness.log.withOp('http.response');
      for (const line of responses) {
        const request_ = harness.log
          .withOp('http.request')
          .find((candidate) => candidate['url'] === line['url']);
        expect(line['traceId']).toBe(request_?.['traceId']);
      }
    });

    it('never writes the Authorization header', async () => {
      await http().get('/health').set('authorization', 'Bearer super-secret');

      expect(JSON.stringify(harness.log.lines)).not.toContain('super-secret');
    });
  });

  describe('POST /auth/session', () => {
    it('completes the exchange and puts the refresh token out of reach of any script', async () => {
      await queueTokens();

      const response = await http()
        .post('/auth/session')
        .send({ code: 'c', codeVerifier: 'v'.repeat(43), redirectUri: 'http://localhost:5173/cb' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ expiresInSeconds: 900, userId: 'auth|42' });
      expect(response.body).not.toHaveProperty('refreshToken');

      const cookie = setCookie(response.headers as Record<string, unknown>);
      expect(cookie).toContain('rc_refresh=r1');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/auth');
    });

    it('sends the code verifier to the provider, and never writes it to the log', async () => {
      await queueTokens();

      await http()
        .post('/auth/session')
        .send({ code: 'c', codeVerifier: 'v'.repeat(43), redirectUri: 'http://localhost:5173/cb' });

      expect(identity.tokenRequests.at(-1)).toContain('code_verifier=');
      expect(JSON.stringify(harness.log.lines)).not.toContain('v'.repeat(43));
    });

    it('answers 401 when the provider refuses the code', async () => {
      identity.answerToken({ status: 400, body: { error: 'invalid_grant' } });

      const response = await http()
        .post('/auth/session')
        .send({ code: 'c', codeVerifier: 'v'.repeat(43), redirectUri: 'http://localhost:5173/cb' });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('POST /auth/refresh', () => {
    it('answers 401 when the browser sent no cookie, without calling the provider', async () => {
      const before = identity.tokenRequests.length;

      const response = await http().post('/auth/refresh');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
      expect(identity.tokenRequests).toHaveLength(before);
    });

    it('rotates the credential and writes the new cookie', async () => {
      await queueTokens('r2');

      const response = await http().post('/auth/refresh').set('Cookie', 'rc_refresh=r1');

      expect(response.status).toBe(200);
      expect(setCookie(response.headers as Record<string, unknown>)).toContain('rc_refresh=r2');
    });

    it('clears the cookie when the provider stops issuing a refresh token', async () => {
      await queueTokens(null);

      const response = await http().post('/auth/refresh').set('Cookie', 'rc_refresh=r1');

      expect(setCookie(response.headers as Record<string, unknown>)).toContain('rc_refresh=;');
    });
  });

  describe('POST /auth/logout', () => {
    it('answers 204 and drops the cookie', async () => {
      const response = await http().post('/auth/logout');

      expect(response.status).toBe(204);
      expect(setCookie(response.headers as Record<string, unknown>)).toContain('rc_refresh=;');
    });
  });
});
