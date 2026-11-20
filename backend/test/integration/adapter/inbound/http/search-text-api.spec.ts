import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';

import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';

/**
 * `POST /search/text`, against the real application — the real ripgrep binary, the real process
 * runner, over a real folder (plan 11, B-10, B-12). Every line of the NDJSON body (D-02) is parsed
 * and checked; only PostgreSQL and the identity provider are fixtures.
 */
describe('the search-text HTTP surface — plan 11', () => {
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

    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src', 'a.txt'), 'hello needle world\n');
    await writeFile(path.join(root, 'src', 'b.txt'), 'nothing here\n');

    harness = await startTestApp(database.url, identity, (builder) => builder, allowlist);
    token = await identity.accessToken({ subject: SUBJECT });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());

  function searchText(body: Record<string, unknown>): request.Test {
    return http()
      .post('/search/text')
      .set('authorization', `Bearer ${token}`)
      .send({
        folder: root,
        isRegex: false,
        caseSensitive: false,
        wholeWord: false,
        useIgnoreFiles: true,
        ...body,
      });
  }

  function framesOf(text: string): unknown[] {
    return text
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as unknown);
  }

  it('streams one file frame and ends with truncated: null — S-64, S-167', async () => {
    const response = await searchText({ pattern: 'needle' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/x-ndjson');
    expect(response.headers['cache-control']).toBe('no-transform');
    expect(response.headers['x-accel-buffering']).toBe('no');

    const frames = framesOf(response.text);
    expect(frames).toEqual([
      {
        type: 'file',
        path: 'src/a.txt',
        matches: [
          {
            line: 1,
            column: 7,
            endColumn: 13,
            preview: 'hello needle world',
            previewMatchStart: 6,
            previewMatchEnd: 12,
          },
        ],
        contextLines: [],
      },
      { type: 'end', truncated: null, skipped: 0 },
    ]);
  });

  it('answers only the end frame when nothing matches — S-75', async () => {
    const response = await searchText({ pattern: 'no-such-pattern-anywhere' });

    expect(framesOf(response.text)).toEqual([{ type: 'end', truncated: null, skipped: 0 }]);
  });

  it('refuses a malformed query with its own status, before the stream ever opens — S-25', async () => {
    const response = await searchText({ pattern: '' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'INVALID_INPUT' } });
  });

  it('answers 401 without a credential', async () => {
    const response = await http().post('/search/text').send({
      folder: root,
      pattern: 'needle',
      isRegex: false,
      caseSensitive: false,
      wholeWord: false,
      useIgnoreFiles: true,
    });

    expect(response.status).toBe(401);
  });

  it("refuses a pattern reaching outside the open folder's onlyPaths — S-25", async () => {
    const response = await searchText({ pattern: 'needle', onlyPaths: ['../elsewhere.txt'] });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'INVALID_INPUT' } });
  });
});
