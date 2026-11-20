import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';

import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';

/**
 * `POST /search/replace/preview` and `POST /search/replace`, against the real application — the
 * real ripgrep binary, the real file read/write of plan 07, over a real folder (plan 11, B-11,
 * B-12). This is the one test that proves the cross-module Nest wiring (`ReadFileUseCase`,
 * `SaveFileUseCase`, `SearchReplacePreviewUseCase`, `SearchReplaceApplyUseCase`) actually
 * resolves — the same class of bug B-10 found in `SearchController`'s own constructor.
 */
describe('the search-replace HTTP surface — plan 11', () => {
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

    harness = await startTestApp(database.url, identity, (builder) => builder, allowlist);
    token = await identity.accessToken({ subject: SUBJECT });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  beforeEach(async () => {
    await mkdir(path.join(root, 'src'), { recursive: true });
  });

  afterEach(async () => {
    await writeFile(path.join(root, 'src', 'a.txt'), '').catch(() => undefined);
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());

  function replacePreview(body: Record<string, unknown>): request.Test {
    return http()
      .post('/search/replace/preview')
      .set('authorization', `Bearer ${token}`)
      .send({
        folder: root,
        isRegex: false,
        caseSensitive: false,
        wholeWord: false,
        useIgnoreFiles: true,
        preserveCase: false,
        ...body,
      });
  }

  function replaceApply(body: Record<string, unknown>): request.Test {
    return http()
      .post('/search/replace')
      .set('authorization', `Bearer ${token}`)
      .send({
        folder: root,
        isRegex: false,
        caseSensitive: false,
        wholeWord: false,
        useIgnoreFiles: true,
        preserveCase: false,
        ...body,
      });
  }

  function framesOf(text: string): unknown[] {
    return text
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as unknown);
  }

  it('previews a match with its ETag and resolved replacement — S-81', async () => {
    await writeFile(path.join(root, 'src', 'a.txt'), 'hello needle world\n');

    const response = await replacePreview({ pattern: 'needle', replacement: 'found' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/x-ndjson');
    const frames = framesOf(response.text);

    expect(frames[0]).toMatchObject({
      type: 'file',
      path: 'src/a.txt',
      matches: [expect.objectContaining({ replacement: 'found' })],
    });
    expect(frames[1]).toEqual({ type: 'end', truncated: null, skipped: 0 });
  });

  it('applies the replace end to end and actually rewrites the file — S-83', async () => {
    await writeFile(path.join(root, 'src', 'a.txt'), 'hello needle world\n');

    const preview = await replacePreview({ pattern: 'needle', replacement: 'found' });
    const [fileFrame] = framesOf(preview.text) as [{ etag: string }];

    const apply = await replaceApply({
      pattern: 'needle',
      replacement: 'found',
      files: [{ path: 'src/a.txt', etag: fileFrame.etag }],
    });

    expect(apply.status).toBe(200);
    expect(apply.body).toEqual({
      report: { applied: ['src/a.txt'], changed: [], missing: [], skipped: [] },
    });
    const written = await readFile(path.join(root, 'src', 'a.txt'), 'utf8');
    expect(written).toBe('hello found world\n');
  });

  it('applying the same request a second time reports changed, never substitutes twice — S-85', async () => {
    await writeFile(path.join(root, 'src', 'a.txt'), 'hello needle world\n');

    const preview = await replacePreview({ pattern: 'needle', replacement: 'found' });
    const [fileFrame] = framesOf(preview.text) as [{ etag: string }];
    const request = {
      pattern: 'needle',
      replacement: 'found',
      files: [{ path: 'src/a.txt', etag: fileFrame.etag }],
    };

    const first = await replaceApply(request);
    const second = await replaceApply(request);

    expect(first.body).toEqual({
      report: { applied: ['src/a.txt'], changed: [], missing: [], skipped: [] },
    });
    expect(second.body).toEqual({
      report: { applied: [], changed: ['src/a.txt'], missing: [], skipped: [] },
    });
    const written = await readFile(path.join(root, 'src', 'a.txt'), 'utf8');
    expect(written).toBe('hello found world\n');
  });

  it('preserves a file changed since the preview, without overwriting it — S-84', async () => {
    await writeFile(path.join(root, 'src', 'a.txt'), 'hello needle world\n');

    const preview = await replacePreview({ pattern: 'needle', replacement: 'found' });
    const [fileFrame] = framesOf(preview.text) as [{ etag: string }];

    await writeFile(path.join(root, 'src', 'a.txt'), 'hello needle world, changed\n');

    const apply = await replaceApply({
      pattern: 'needle',
      replacement: 'found',
      files: [{ path: 'src/a.txt', etag: fileFrame.etag }],
    });

    expect(apply.body).toEqual({
      report: { applied: [], changed: ['src/a.txt'], missing: [], skipped: [] },
    });
    const untouched = await readFile(path.join(root, 'src', 'a.txt'), 'utf8');
    expect(untouched).toBe('hello needle world, changed\n');
  });

  it('reports missing a file deleted since the preview — S-86', async () => {
    const apply = await replaceApply({
      pattern: 'needle',
      replacement: 'found',
      files: [{ path: 'src/nope.txt', etag: 'whatever' }],
    });

    expect(apply.body).toEqual({
      report: { applied: [], changed: [], missing: ['src/nope.txt'], skipped: [] },
    });
  });

  it('refuses a file with no ETag at all, nothing written — S-93', async () => {
    await writeFile(path.join(root, 'src', 'a.txt'), 'hello needle world\n');

    const apply = await replaceApply({
      pattern: 'needle',
      replacement: 'found',
      files: [{ path: 'src/a.txt', etag: '' }],
    });

    expect(apply.status).toBe(428);
    const untouched = await readFile(path.join(root, 'src', 'a.txt'), 'utf8');
    expect(untouched).toBe('hello needle world\n');
  });

  it('refuses a file path that climbs out of the folder, nothing written — S-91', async () => {
    const apply = await replaceApply({
      pattern: 'needle',
      replacement: 'found',
      files: [{ path: '../outside.txt', etag: 'x' }],
    });

    expect(apply.status).toBe(400);
    expect(apply.body).toMatchObject({ error: { code: 'INVALID_INPUT' } });
  });

  it('preserves CRLF line endings and the byte-order mark on disk — S-90', async () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    await writeFile(
      path.join(root, 'src', 'a.txt'),
      Buffer.concat([bom, Buffer.from('before\r\nneedle here\r\nafter\r\n', 'utf8')]),
    );

    const preview = await replacePreview({ pattern: 'needle', replacement: 'found' });
    const [fileFrame] = framesOf(preview.text) as [{ etag: string }];

    const apply = await replaceApply({
      pattern: 'needle',
      replacement: 'found',
      files: [{ path: 'src/a.txt', etag: fileFrame.etag }],
    });

    expect(apply.body).toEqual({
      report: { applied: ['src/a.txt'], changed: [], missing: [], skipped: [] },
    });
    const written = await readFile(path.join(root, 'src', 'a.txt'));
    expect(written.subarray(0, 3)).toEqual(bom);
    expect(written.subarray(3).toString('utf8')).toBe('before\r\nfound here\r\nafter\r\n');
  });

  it('writes a shell-looking replacement literally — only $0/$$ are ever interpreted — S-96', async () => {
    await writeFile(path.join(root, 'src', 'a.txt'), 'hello needle world\n');
    const shellLooking = '-rf; $(rm -rf /) && echo done';

    const preview = await replacePreview({ pattern: 'needle', replacement: shellLooking });
    const [fileFrame] = framesOf(preview.text) as [
      { matches: [{ replacement: string }]; etag: string },
    ];
    expect(fileFrame.matches[0]?.replacement).toBe(shellLooking);

    const apply = await replaceApply({
      pattern: 'needle',
      replacement: shellLooking,
      files: [{ path: 'src/a.txt', etag: fileFrame.etag }],
    });

    expect(apply.body).toEqual({
      report: { applied: ['src/a.txt'], changed: [], missing: [], skipped: [] },
    });
    const written = await readFile(path.join(root, 'src', 'a.txt'), 'utf8');
    expect(written).toBe(`hello ${shellLooking} world\n`);
  });

  it('"preserve case" on disk matches the preview exactly — S-97', async () => {
    await writeFile(path.join(root, 'src', 'a.txt'), 'hello Needle world\n');

    const preview = await replacePreview({
      pattern: 'needle',
      replacement: 'found',
      preserveCase: true,
    });
    const [fileFrame] = framesOf(preview.text) as [
      { matches: [{ replacement: string }]; etag: string },
    ];
    expect(fileFrame.matches[0]?.replacement).toBe('Found');

    const apply = await replaceApply({
      pattern: 'needle',
      replacement: 'found',
      preserveCase: true,
      files: [{ path: 'src/a.txt', etag: fileFrame.etag }],
    });

    expect(apply.body).toEqual({
      report: { applied: ['src/a.txt'], changed: [], missing: [], skipped: [] },
    });
    const written = await readFile(path.join(root, 'src', 'a.txt'), 'utf8');
    expect(written).toBe('hello Found world\n');
  });

  it('refuses more files than the apply ceiling allows, before touching any — S-94', async () => {
    await writeFile(path.join(root, 'src', 'a.txt'), 'hello needle world\n');
    const files = Array.from({ length: 1_001 }, (_, index) => ({
      path: `src/missing-${String(index)}.txt`,
      etag: 'x',
    }));

    const apply = await replaceApply({ pattern: 'needle', replacement: 'found', files });

    expect(apply.status).toBe(413);
    expect(apply.body).toMatchObject({
      error: { code: 'PAYLOAD_TOO_LARGE', params: { measure: 'files' } },
    });
    const untouched = await readFile(path.join(root, 'src', 'a.txt'), 'utf8');
    expect(untouched).toBe('hello needle world\n');
  });

  it('refuses a malformed query with its own status, before the preview stream opens — S-25', async () => {
    const response = await replacePreview({ pattern: '', replacement: 'found' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'INVALID_INPUT' } });
  });

  it('answers 401 without a credential, for both routes', async () => {
    const preview = await http().post('/search/replace/preview').send({
      folder: root,
      pattern: 'needle',
      isRegex: false,
      caseSensitive: false,
      wholeWord: false,
      useIgnoreFiles: true,
      replacement: 'found',
      preserveCase: false,
    });
    const apply = await http().post('/search/replace').send({
      folder: root,
      pattern: 'needle',
      isRegex: false,
      caseSensitive: false,
      wholeWord: false,
      useIgnoreFiles: true,
      replacement: 'found',
      preserveCase: false,
      files: [],
    });

    expect(preview.status).toBe(401);
    expect(apply.status).toBe(401);
  });
});
