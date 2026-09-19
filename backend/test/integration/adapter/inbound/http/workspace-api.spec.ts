import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';

import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';

/**
 * `GET /workspaces` and `GET /workspaces/resolve`, against the real application.
 *
 * The filter, the guard, the pipe and the container are the real ones. Only PostgreSQL and the
 * identity provider are fixtures — a suite that stubs the edge leaves the edge untested, and the
 * edge is where a `403` turns into a `404`.
 */
describe('the workspace HTTP surface', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let token: string;
  let root: string;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;

    await mkdir(path.join(root, 'app'), { recursive: true });
    await mkdir(path.join(root, '..', 'outside'), { recursive: true });
    await writeFile(path.join(root, 'readme.md'), 'x', 'utf8');
    await symlink(path.join(root, '..', 'outside'), path.join(root, 'escape'));

    harness = await startTestApp(database.url, identity, (builder) => builder, allowlist);
    token = await identity.accessToken({ subject: SUBJECT });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());

  const authorised = (url: string): request.Test =>
    http().get(url).set('authorization', `Bearer ${token}`);

  describe('GET /workspaces', () => {
    it('answers only the configured roots, and does not walk the disk — S-19', async () => {
      const response = await authorised('/workspaces');

      expect(response.status).toBe(200);
      // One entry for the root, and nothing for `app`, `readme.md` or `escape` underneath it.
      expect(response.body).toEqual({
        workspaces: [{ path: root, label: 'Suite', lastUsedAt: null }],
      });
    });

    it('never says who else may reach a root', async () => {
      expect(JSON.stringify((await authorised('/workspaces')).body)).not.toContain(SUBJECT);
    });

    it('answers 401 without a credential', async () => {
      const response = await http().get('/workspaces');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('answers 401 for a credential that is not a bearer token', async () => {
      const response = await http().get('/workspaces').set('authorization', `Basic ${token}`);

      expect(response.status).toBe(401);
    });

    it('answers 401 for a token the provider did not sign', async () => {
      const response = await http().get('/workspaces').set('authorization', 'Bearer not-a-token');

      expect(response.status).toBe(401);
      // It never says which validation failed: that detail is in the log, not in the body.
      expect(JSON.stringify(response.body)).not.toContain('signature');
    });

    it('answers nothing for a user no root mentions', async () => {
      const stranger = await identity.accessToken({ subject: 'auth|stranger' });
      const response = await http().get('/workspaces').set('authorization', `Bearer ${stranger}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ workspaces: [] });
    });
  });

  describe('GET /workspaces/resolve', () => {
    it('answers 200 and the real path for a directory inside a root', async () => {
      const response = await authorised(
        `/workspaces/resolve?path=${encodeURIComponent(path.join(root, 'app'))}`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        path: path.join(root, 'app'),
        root: { path: root, label: 'Suite', lastUsedAt: null },
      });
    });

    it('answers 200 for the root itself', async () => {
      expect(
        (await authorised(`/workspaces/resolve?path=${encodeURIComponent(root)}`)).status,
      ).toBe(200);
    });

    it('answers 400 for a relative path', async () => {
      const response = await authorised('/workspaces/resolve?path=app');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
      expect(response.body.error.details).toEqual([{ field: 'path', rule: 'mustBeAbsolute' }]);
    });

    it('answers 400 when the path is missing from the query', async () => {
      expect((await authorised('/workspaces/resolve')).status).toBe(400);
    });

    it('answers 403 for a path outside every root', async () => {
      const response = await authorised('/workspaces/resolve?path=%2Fetc');

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('WORKSPACE_NOT_ALLOWED');
    });

    it('answers 403 for a path that escapes the root once normalised', async () => {
      const escape = encodeURIComponent(`${root}/../../etc`);

      expect((await authorised(`/workspaces/resolve?path=${escape}`)).status).toBe(403);
    });

    it('answers 403 for a symlink inside the root pointing outside it — S-12', async () => {
      const response = await authorised(
        `/workspaces/resolve?path=${encodeURIComponent(path.join(root, 'escape'))}`,
      );

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('WORKSPACE_NOT_ALLOWED');
    });

    it('answers 404 for a path that does not exist inside the root — S-15', async () => {
      const response = await authorised(
        `/workspaces/resolve?path=${encodeURIComponent(path.join(root, 'gone'))}`,
      );

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('WORKSPACE_NOT_FOUND');
    });

    it('answers 422 for a path that exists and is a file — S-14', async () => {
      const response = await authorised(
        `/workspaces/resolve?path=${encodeURIComponent(path.join(root, 'readme.md'))}`,
      );

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('WORKSPACE_NOT_A_DIRECTORY');
    });

    it('answers 403 for a root that is somebody else’s — D-17', async () => {
      // Authenticated, and still not permitted: that is what `403` means. `404` here was a
      // semantics of its own, meant to avoid confirming the directory exists.
      const stranger = await identity.accessToken({ subject: 'auth|stranger' });
      const response = await http()
        .get(`/workspaces/resolve?path=${encodeURIComponent(root)}`)
        .set('authorization', `Bearer ${stranger}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('carries a trace id and an http equivalent on every refusal', async () => {
      const body = (await authorised('/workspaces/resolve?path=%2Fetc')).body;

      expect(body.error).toMatchObject({
        messageKey: 'workspace.error.notAllowed',
        httpEquivalent: 403,
        traceId: expect.any(String),
      });
    });

    it('never leaks a server path or a stack in a refusal', async () => {
      const body = JSON.stringify((await authorised('/workspaces/resolve?path=%2Fetc')).body);

      expect(body).not.toContain('at Object');
      expect(body).not.toContain('node_modules');
    });

    it('answers 401 without a credential', async () => {
      expect((await http().get('/workspaces/resolve?path=%2Fetc')).status).toBe(401);
    });
  });
});
