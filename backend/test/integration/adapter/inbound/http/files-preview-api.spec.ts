import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readlinkSync } from 'node:fs';
import { mkdir, symlink, truncate, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import request from 'supertest';

import { AUDIT_EVENT_REPOSITORY } from '@application/audit';
import { DrizzleAuditEventRepository } from '@adapter/outbound/persistence/audit/drizzle-audit-event.repository';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestAllowlist, TestApp } from '../../../../support/app/test-app';
import { SwitchableAuditEvents } from '../../../../support/fakes/switchable-audit-events';
import { readZip } from '../../../../support/files/zip-reader';

/** The `ETag` of some contents, as the server computes it. */
function etagOf(content: string | Buffer): string {
  return `"${createHash('sha256').update(content).digest('hex')}"`;
}

/**
 * A body read as bytes, whatever its type says. Superagent hands a parser the raw message, which
 * its types call a `Response`.
 */
function binary(
  response: request.Response,
  done: (error: Error | null, body: Buffer) => void,
): void {
  const message = response as unknown as http.IncomingMessage;
  const chunks: Buffer[] = [];

  message.on('data', (chunk: Buffer) => chunks.push(chunk));
  message.on('end', () => {
    done(null, Buffer.concat(chunks));
  });
}

/** One fact of the trail, as `GET /audit-events` answers it. */
interface FactBody {
  readonly kind: string;
  readonly subjectId: string;
  readonly subjectLabel: string;
  readonly details: Readonly<Record<string, unknown>>;
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

/**
 * `GET /files/limits`, `GET /files/raw` and `GET /files/archive` against the real application —
 * plan 07, B-48: the bytes of a file under the headers of D-18, by range, and a selection as a zip,
 * measured and in the trail before the first byte.
 */
describe('the files HTTP surface — previews and downloads', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let trail: SwitchableAuditEvents;
  let token: string;
  let allowlist: TestAllowlist;
  let root: string;
  let folder: string;
  let counter = 0;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;
    await mkdir(path.join(root, 'outside'));
    await writeFile(path.join(root, 'outside', 'secret.txt'), 'outside\n');

    harness = await startTestApp(
      database.url,
      identity,
      (builder) =>
        builder.overrideProvider(AUDIT_EVENT_REPOSITORY).useFactory({
          inject: [PERSISTENCE_CONTEXT],
          factory: (context: PersistenceContext) =>
            new SwitchableAuditEvents(new DrizzleAuditEventRepository(context)),
        }),
      allowlist,
    );
    trail = harness.app.get(AUDIT_EVENT_REPOSITORY);
    token = await identity.accessToken({ subject: SUBJECT });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  beforeEach(async () => {
    counter += 1;
    folder = path.join(root, `case-${String(counter)}`);
    await mkdir(folder);
    trail.failure = null;
  });

  const at = (...segments: string[]): string => path.join(folder, ...segments);
  const authed = (test: request.Test): request.Test => test.set('authorization', `Bearer ${token}`);
  const http_ = (): request.Agent => request(harness.app.getHttpServer());

  const raw = (relative: string, extra: Record<string, string> = {}): request.Test =>
    authed(
      http_().get(
        `/files/raw?${new URLSearchParams({ folder, path: relative, ...extra }).toString()}`,
      ),
    )
      .buffer(true)
      .parse(binary);

  const archive = (...relatives: string[]): request.Test => {
    const query = new URLSearchParams({ folder });
    relatives.forEach((relative) => {
      query.append('path', relative);
    });

    return authed(http_().get(`/files/archive?${query.toString()}`))
      .buffer(true)
      .parse(binary);
  };

  /** The facts about this test's folder, oldest first. */
  const facts = async (): Promise<FactBody[]> =>
    ((await authed(http_().get('/audit-events?kind=file.&limit=100'))).body.events as FactBody[])
      .filter((fact) => fact.subjectId.startsWith(`${folder}/`) || fact.subjectId === folder)
      .reverse();

  describe('GET /files/limits — B-47', () => {
    it('says every ceiling before the client starts', async () => {
      const response = await authed(http_().get('/files/limits'));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        maxEditBytes: 65_536,
        largeFileBytes: 16_384,
        downloadMaxBytes: 262_144,
        archiveMaxEntries: 200,
        uploadMaxBytes: 65_536,
        uploadMaxEntries: 50,
        uploadMaxTotalBytes: 262_144,
        historyMaxFileBytes: 65_536,
      });
    });

    it('answers nobody without a token', async () => {
      expect((await http_().get('/files/limits')).status).toBe(401);
    });
  });

  describe('GET /files/raw — B-48', () => {
    it('serves a whole file with its type read from its bytes, and the headers of D-18 — S-293', async () => {
      await writeFile(at('logo.txt'), PNG);

      const response = await raw('logo.txt');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(PNG);
      expect(response.headers).toMatchObject({
        'content-type': 'image/png',
        'x-content-type-options': 'nosniff',
        'content-security-policy': 'sandbox',
        'content-disposition': `inline; filename="logo.txt"; filename*=UTF-8''logo.txt`,
        'accept-ranges': 'bytes',
        etag: etagOf(PNG),
        'content-length': String(PNG.length),
      });
    });

    it('serves text as text, in UTF-8', async () => {
      await writeFile(at('notes.md'), '# olá\n');

      const response = await raw('notes.md');

      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(response.body.toString('utf8')).toBe('# olá\n');
    });

    it('serves one range as 206, with where it is in the file — S-294', async () => {
      await writeFile(at('digits.txt'), '0123456789');

      const response = await raw('digits.txt').set('range', 'bytes=2-5');

      expect(response.status).toBe(206);
      expect(response.body.toString()).toBe('2345');
      expect(response.headers['content-range']).toBe('bytes 2-5/10');
      expect(response.headers['content-length']).toBe('4');
      expect(response.headers['etag']).toBe(etagOf('0123456789'));
    });

    it('ignores several ranges and serves the whole file', async () => {
      await writeFile(at('digits.txt'), '0123456789');

      const response = await raw('digits.txt').set('range', 'bytes=0-1,4-5');

      expect(response.status).toBe(200);
      expect(response.body.toString()).toBe('0123456789');
      expect(response.headers['content-range']).toBeUndefined();
    });

    it('refuses a range past the end with the size, under the headers of D-18 — S-295', async () => {
      await writeFile(at('digits.txt'), '0123456789');

      const response = await authed(
        http_().get(`/files/raw?${new URLSearchParams({ folder, path: 'digits.txt' }).toString()}`),
      ).set('range', 'bytes=10-');

      expect(response.status).toBe(416);
      expect(response.headers['content-range']).toBe('bytes */10');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-security-policy']).toBe('sandbox');
      expect(response.body.error).toMatchObject({
        code: 'RANGE_NOT_SATISFIABLE',
        messageKey: 'files.error.rangeNotSatisfiable',
        params: { size: 10 },
      });
    });

    it.each([
      [
        'an HTML page',
        'page.html',
        '<!doctype html><script>alert(1)</script>',
        'text/plain; charset=utf-8',
        'inline',
      ],
      [
        'a page named as an image',
        'fake.png',
        '<html><script>alert(1)</script></html>',
        'text/plain; charset=utf-8',
        'inline',
      ],
      [
        'an SVG with a script',
        'icon.svg',
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        'image/svg+xml',
        'inline',
      ],
      [
        'a binary',
        'blob.bin',
        Buffer.from([0x00, 0x01, 0xfe]),
        'application/octet-stream',
        'attachment',
      ],
    ])(
      'never serves %s as an active document — S-296',
      async (_name, name, contents, type, disposition) => {
        await writeFile(at(name), contents);

        const response = await raw(name);

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe(type);
        expect(response.headers['content-type']).not.toContain('html');
        expect(response.headers['content-disposition']).toMatch(new RegExp(`^${disposition};`));
        expect(response.headers['content-security-policy']).toBe('sandbox');
        expect(response.headers['x-content-type-options']).toBe('nosniff');
      },
    );

    it('sends anything as an attachment when it is a download — S-296', async () => {
      await writeFile(at('logo.png'), PNG);

      const response = await raw('logo.png', { download: 'true' });

      expect(response.headers['content-type']).toBe('image/png');
      expect(response.headers['content-disposition']).toMatch(/^attachment;/);
    });

    it('refuses a page of another version, with the current one — B-51', async () => {
      await writeFile(at('digits.txt'), '0123456789');
      const first = await raw('digits.txt').set('range', 'bytes=0-4');
      await writeFile(at('digits.txt'), '9876543210');

      const stale = await authed(
        http_().get(`/files/raw?${new URLSearchParams({ folder, path: 'digits.txt' }).toString()}`),
      )
        .set('range', 'bytes=5-9')
        .set('if-match', first.headers['etag'] ?? '');
      const fresh = await raw('digits.txt')
        .set('range', 'bytes=5-9')
        .set('if-match', etagOf('9876543210'));

      expect(stale.status).toBe(412);
      expect(stale.headers['etag']).toBe(etagOf('9876543210'));
      expect(stale.body.error).toMatchObject({ code: 'FILE_CHANGED' });
      expect(fresh.status).toBe(206);
      expect(fresh.body.toString()).toBe('43210');
    });

    it('refuses a whole file past the download ceiling, and serves a page of it — fron', async () => {
      await writeFile(at('big.bin'), Buffer.alloc(262_145, 0x61));
      await writeFile(at('edge.bin'), Buffer.alloc(262_144, 0x61));

      const whole = await authed(
        http_().get(`/files/raw?${new URLSearchParams({ folder, path: 'big.bin' }).toString()}`),
      );
      const page = await raw('big.bin').set('range', 'bytes=0-1023');
      const edge = await raw('edge.bin');

      expect(whole.status).toBe(413);
      expect(whole.body.error).toMatchObject({
        code: 'FILE_TOO_LARGE',
        params: { size: 262_145, limit: 262_144, measure: 'bytes' },
      });
      expect(page.status).toBe(206);
      expect(page.body).toHaveLength(1024);
      expect(edge.status).toBe(200);
      expect(edge.body).toHaveLength(262_144);
    });

    it('serves an empty file as no bytes', async () => {
      await writeFile(at('empty.txt'), '');

      const response = await raw('empty.txt');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(0);
      expect(response.headers['etag']).toBe(etagOf(''));
    });

    it('follows a link inside, and refuses one that leads out — the fence of F1', async () => {
      await writeFile(at('a.txt'), 'inside\n');
      await symlink(at('a.txt'), at('link.txt'));
      await symlink(path.join(root, 'outside', 'secret.txt'), at('out.txt'));

      expect((await raw('link.txt')).body.toString()).toBe('inside\n');

      const outside = await authed(
        http_().get(`/files/raw?${new URLSearchParams({ folder, path: 'out.txt' }).toString()}`),
      );
      expect(outside.status).toBe(403);
      expect(outside.body.error.code).toBe('WORKSPACE_NOT_ALLOWED');
    });

    it.each([
      ['a folder', 'sub', 422, 'FILE_NOT_A_FILE'],
      ['a FIFO', 'pipe', 422, 'FILE_NOT_A_FILE'],
      ['nothing', 'gone.txt', 404, 'FILE_NOT_FOUND'],
      ['a path that climbs out', '../outside/secret.txt', 403, 'WORKSPACE_NOT_ALLOWED'],
      ['an absolute path', '/etc/passwd', 400, 'INVALID_INPUT'],
    ])('refuses %s', async (_name, relative, status, code) => {
      await mkdir(at('sub'));
      execFileSync('mkfifo', [at('pipe')]);

      const response = await authed(
        http_().get(`/files/raw?${new URLSearchParams({ folder, path: relative }).toString()}`),
      );

      expect(response.status).toBe(status);
      expect(response.body.error.code).toBe(code);
    });

    it('keeps a preview out of the trail, and in the log without the contents — D-02', async () => {
      const marker = 'marker-5d1e-never-logged';
      await writeFile(at('marked.txt'), `${marker}\n`);
      const before = harness.log.lines.length;

      await raw('marked.txt');

      const lines = harness.log.lines.slice(before);
      expect(
        lines.find((line) => line['op'] === 'files.raw' && line['outcome'] === 'done'),
      ).toMatchObject({
        folder,
        path: 'marked.txt',
        bytes: marker.length + 1,
      });
      expect(lines.some((line) => line['op'] === 'files.raw.sent')).toBe(true);
      expect(JSON.stringify(lines)).not.toContain(marker);
      expect(await facts()).toEqual([]);
    });

    it('records a download in the trail — S-300', async () => {
      await writeFile(at('report.pdf'), '%PDF-1.7\n');

      const response = await raw('report.pdf', { download: 'true' });

      expect(response.status).toBe(200);
      expect(await facts()).toEqual([
        expect.objectContaining({
          kind: 'file.downloaded',
          subjectId: at('report.pdf'),
          subjectLabel: 'report.pdf',
          details: expect.objectContaining({
            sizeBytes: 9,
            hash: etagOf('%PDF-1.7\n'),
            archive: false,
          }),
        }),
      ]);
    });

    it('sends nothing of a download when the trail is down — S-300', async () => {
      await writeFile(at('report.pdf'), '%PDF-1.7\n');
      trail.failure = new Error('the database is gone');

      const response = await authed(
        http_().get(
          `/files/raw?${new URLSearchParams({ folder, path: 'report.pdf', download: 'true' }).toString()}`,
        ),
      );

      expect(response.status).toBe(503);
      expect(response.headers['retry-after']).toBe('5');
      expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(JSON.stringify(response.body)).not.toContain('PDF');
    });
  });

  describe('GET /files/archive — B-48', () => {
    /** A folder with one of everything the walk meets. */
    async function plantProject(): Promise<void> {
      await mkdir(at('proj', 'src'), { recursive: true });
      await mkdir(at('proj', '.git'));
      await mkdir(at('proj', 'empty'));
      await writeFile(at('proj', 'readme.md'), '# readme\n');
      await writeFile(at('proj', 'src', 'a.ts'), 'export const a = 1;\n');
      await writeFile(at('proj', '.git', 'HEAD'), 'ref: refs/heads/main\n');
      await writeFile(at('proj', '.DS_Store'), 'x');
      await writeFile(Buffer.from(`${at('proj')}/n\xffo.txt`, 'latin1'), 'not utf-8\n');
      await symlink(at('proj', 'src', 'a.ts'), at('proj', 'link-inside.ts'));
      await symlink(at('proj', 'src'), at('proj', 'link-to-src'));
      await symlink(path.join(root, 'outside', 'secret.txt'), at('proj', 'link-outside.txt'));
      await symlink(at('proj', 'nowhere'), at('proj', 'broken'));
      execFileSync('mkfifo', [at('proj', 'pipe')]);
    }

    it('streams a folder as a zip, leaving out what the contract leaves out — S-297', async () => {
      await plantProject();

      const response = await archive('proj');
      const zip = await readZip(response.body);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/zip');
      expect(response.headers['content-disposition']).toBe(
        `attachment; filename="proj.zip"; filename*=UTF-8''proj.zip`,
      );
      expect([...zip.keys()].sort()).toEqual([
        'proj/',
        'proj/empty/',
        'proj/link-inside.ts',
        'proj/readme.md',
        'proj/src/',
        'proj/src/a.ts',
      ]);
      expect(zip.get('proj/link-inside.ts')?.toString()).toBe('export const a = 1;\n');
      expect(zip.get('proj/readme.md')?.toString()).toBe('# readme\n');
    });

    it('keeps a hidden item that was itself selected', async () => {
      await plantProject();

      const zip = await readZip((await archive('proj/.git')).body);

      expect([...zip.keys()].sort()).toEqual(['.git/', '.git/HEAD']);
    });

    it('zips the open folder under its own name', async () => {
      await writeFile(at('a.txt'), 'a');

      const response = await archive('');
      const zip = await readZip(response.body);

      expect([...zip.keys()].sort()).toEqual([
        `case-${String(counter)}/`,
        `case-${String(counter)}/a.txt`,
      ]);
    });

    it('zips a selection of two files and a folder, one download each, before the first byte — S-359', async () => {
      await mkdir(at('docs', 'guides'), { recursive: true });
      await writeFile(at('docs', 'a.md'), 'A');
      await writeFile(at('docs', 'b.md'), 'BB');
      await writeFile(at('docs', 'guides', 'c.md'), 'CCC');

      const response = await archive('docs/a.md', 'docs/b.md', 'docs/guides');
      const zip = await readZip(response.body);

      expect(response.headers['content-disposition']).toMatch(/filename="docs.zip"/);
      expect([...zip.keys()].sort()).toEqual(['a.md', 'b.md', 'guides/', 'guides/c.md']);
      expect(zip.get('guides/c.md')?.toString()).toBe('CCC');
      expect((await facts()).map((fact) => [fact.kind, fact.subjectLabel, fact.details])).toEqual([
        [
          'file.downloaded',
          'docs/a.md',
          { archive: true, entryKind: 'file', entries: 1, sizeBytes: 1 },
        ],
        [
          'file.downloaded',
          'docs/b.md',
          { archive: true, entryKind: 'file', entries: 1, sizeBytes: 2 },
        ],
        [
          'file.downloaded',
          'docs/guides',
          { archive: true, entryKind: 'directory', entries: 2, sizeBytes: 3 },
        ],
      ]);
    });

    it('refuses, before the first byte, a folder past the ceiling of entries — S-298', async () => {
      await mkdir(at('many'));
      await Promise.all(
        Array.from({ length: 200 }, (_, index) => writeFile(at('many', `f${String(index)}`), '')),
      );

      const response = await archive('many');

      expect(response.status).toBe(413);
      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(JSON.parse(response.body.toString()).error).toMatchObject({
        code: 'FILE_TOO_LARGE',
        params: { path: 'many', size: 201, limit: 200, measure: 'entries' },
      });
      expect(await facts()).toEqual([]);
    });

    it('refuses, before the first byte, a folder past the download ceiling in bytes — S-298', async () => {
      await mkdir(at('heavy'));
      await writeFile(at('heavy', 'a.bin'), '');
      // Sparse: the walk measures by `lstat`, and never reads a byte of it.
      await truncate(at('heavy', 'a.bin'), 262_145);

      const response = await archive('heavy');

      expect(response.status).toBe(413);
      expect(JSON.parse(response.body.toString()).error).toMatchObject({
        code: 'FILE_TOO_LARGE',
        params: { size: 262_145, limit: 262_144, measure: 'bytes' },
      });
    });

    it('sends nothing when the trail is down — S-300', async () => {
      await writeFile(at('a.txt'), 'secret contents');
      trail.failure = new Error('the database is gone');

      const response = await archive('a.txt');

      expect(response.status).toBe(503);
      expect(response.body.toString()).not.toContain('secret contents');
    });

    it.each([
      ['nothing there', ['gone'], 404, 'FILE_NOT_FOUND'],
      ['a FIFO selected', ['pipe'], 422, 'FILE_NOT_A_FILE'],
      ['a path that climbs out', ['../outside'], 403, 'WORKSPACE_NOT_ALLOWED'],
      ['no path at all', [], 400, 'INVALID_INPUT'],
    ])('refuses %s', async (_name, relatives, status, code) => {
      execFileSync('mkfifo', [at('pipe')]);

      const response = await archive(...relatives);

      expect(response.status).toBe(status);
      expect(JSON.parse(response.body.toString()).error.code).toBe(code);
    });
  });

  /**
   * A client that goes away in the middle of a zip — with a download ceiling large enough for a
   * file the socket buffers cannot swallow whole, so the server is still reading it when the client
   * leaves.
   */
  describe('a client that aborts — S-299', () => {
    let roomy: TestApp;

    beforeAll(async () => {
      roomy = await startTestApp(database.url, identity, (builder) => builder, allowlist, {
        RC_FILES_DOWNLOAD_MAX_BYTES: String(64 * 1024 * 1024),
      });
    });

    afterAll(async () => {
      await roomy.close();
    });

    /** The descriptors of this process that are open on `file` right now. */
    const descriptorsOn = (file: string): string[] =>
      readdirSync('/proc/self/fd').filter((fd) => {
        try {
          return readlinkSync(`/proc/self/fd/${fd}`) === file;
        } catch {
          return false;
        }
      });

    it('stops the stream and closes every descriptor of the zip', async () => {
      const big = at('big.bin');
      await writeFile(big, randomBytes(32 * 1024 * 1024));
      const query = new URLSearchParams({ folder, path: 'big.bin' }).toString();

      const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
        http
          .get(
            `${roomy.url}/files/archive?${query}`,
            { headers: { authorization: `Bearer ${token}` } },
            resolve,
          )
          .on('error', reject);
      });
      response.pause();

      expect(response.statusCode).toBe(200);
      await vi.waitFor(() => {
        expect(descriptorsOn(big)).toHaveLength(1);
      });

      response.destroy();

      await vi.waitFor(
        () => {
          expect(descriptorsOn(big)).toEqual([]);
        },
        { timeout: 5000 },
      );
      await vi.waitFor(() => {
        expect(roomy.log.withOp('files.archive.sent').at(-1)).toMatchObject({ outcome: 'cut' });
      });
    });
  });
});
