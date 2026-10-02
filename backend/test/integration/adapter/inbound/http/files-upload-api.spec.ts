import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
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
import type { TestApp } from '../../../../support/app/test-app';
import { SwitchableAuditEvents } from '../../../../support/fakes/switchable-audit-events';

/** The `ETag` of some contents, as the server computes it. */
function etagOf(content: string | Buffer): string {
  return `"${createHash('sha256').update(content).digest('hex')}"`;
}

/** One file of an upload, as a test declares it. */
interface Sent {
  readonly path: string;
  readonly content: string | Buffer;
  readonly onConflict?: 'fail' | 'replace' | 'keepBoth';
  readonly ifMatch?: string;
  /** What the manifest says, when it is not the size of `content`. */
  readonly size?: number;
}

/** One fact of the trail, as `GET /audit-events` answers it. */
interface FactBody {
  readonly kind: string;
  readonly subjectId: string;
  readonly subjectLabel: string;
  readonly details: Readonly<Record<string, unknown>>;
}

/** Every temporary of ours, anywhere under a folder. */
async function temporariesUnder(folder: string): Promise<string[]> {
  const names = await readdir(folder, { recursive: true });
  return names.filter((name) => /\.rc-[0-9A-Z]{26}\.tmp$/.test(name));
}

/**
 * `POST /files/upload/preflight` and `POST /files/upload` against the real application — plan 07,
 * B-49: the manifest checked whole before a byte, each file by a temporary and a `link`, the
 * conflict per item, and the trail before the disk.
 */
describe('the files HTTP surface — uploads', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let trail: SwitchableAuditEvents;
  let token: string;
  let root: string;
  let folder: string;
  let counter = 0;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;

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

  const upload = (
    files: readonly Sent[],
    fields: { directory?: string; confirmSensitive?: string; manifest?: string } = {},
  ): request.Test => {
    const manifest =
      fields.manifest ??
      JSON.stringify(
        files.map((file) => ({
          path: file.path,
          size: file.size ?? Buffer.byteLength(file.content),
          onConflict: file.onConflict,
          ifMatch: file.ifMatch,
        })),
      );
    let test = authed(http_().post('/files/upload')).field('folder', folder);

    if (fields.directory !== undefined) {
      test = test.field('directory', fields.directory);
    }

    if (fields.confirmSensitive !== undefined) {
      test = test.field('confirmSensitive', fields.confirmSensitive);
    }

    test = test.field('manifest', manifest);

    for (const file of files) {
      test = test.attach('file', Buffer.from(file.content), path.posix.basename(file.path));
    }

    return test;
  };

  const preflight = (
    items: readonly { path: string; size: number }[],
    directory = '',
  ): request.Test =>
    authed(http_().post('/files/upload/preflight')).send({ folder, directory, items });

  /** The facts about this test's folder, oldest first. */
  const facts = async (): Promise<FactBody[]> =>
    ((await authed(http_().get('/audit-events?kind=file.&limit=100'))).body.events as FactBody[])
      .filter((fact) => fact.subjectId.startsWith(`${folder}/`))
      .reverse();

  /** What the folder holds, all the way down, sorted. */
  const tree = async (): Promise<string[]> => (await readdir(folder, { recursive: true })).sort();

  describe('POST /files/upload — B-49', () => {
    it('writes three files, each with its version — S-301', async () => {
      const response = await upload([
        { path: 'a.txt', content: 'a\n' },
        { path: 'b.bin', content: Buffer.from([0, 1, 2]) },
        { path: 'c.md', content: '# c\n' },
      ]);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        items: [
          { path: 'a.txt', status: 'created', etag: etagOf('a\n') },
          { path: 'b.bin', status: 'created', etag: etagOf(Buffer.from([0, 1, 2])) },
          { path: 'c.md', status: 'created', etag: etagOf('# c\n') },
        ],
      });
      expect(await readFile(at('b.bin'))).toEqual(Buffer.from([0, 1, 2]));
      expect(await tree()).toEqual(['a.txt', 'b.bin', 'c.md']);
    });

    it('fails only the item whose name is taken, and writes the others — S-302', async () => {
      await writeFile(at('b.txt'), 'mine\n');

      const response = await upload([
        { path: 'a.txt', content: 'a' },
        { path: 'b.txt', content: 'theirs' },
        { path: 'c.txt', content: 'c' },
      ]);

      expect(response.status).toBe(207);
      expect(response.body.items).toEqual([
        { path: 'a.txt', status: 'created', etag: etagOf('a') },
        {
          path: 'b.txt',
          status: 'failed',
          error: {
            code: 'FILE_EXISTS',
            messageKey: 'files.error.exists',
            params: { path: 'b.txt', currentEtag: etagOf('mine\n') },
          },
        },
        { path: 'c.txt', status: 'created', etag: etagOf('c') },
      ]);
      expect(await readFile(at('b.txt'), 'utf8')).toBe('mine\n');
    });

    it('replaces with the If-Match of the existing, and refuses without it — S-303', async () => {
      await writeFile(at('a.txt'), 'old\n');
      await writeFile(at('b.txt'), 'old\n');
      await writeFile(at('c.txt'), 'old\n');

      const response = await upload([
        { path: 'a.txt', content: 'new\n', onConflict: 'replace', ifMatch: etagOf('old\n') },
        { path: 'b.txt', content: 'new\n', onConflict: 'replace' },
        { path: 'c.txt', content: 'new\n', onConflict: 'replace', ifMatch: etagOf('other') },
      ]);

      expect(response.status).toBe(207);
      expect(response.body.items).toEqual([
        {
          path: 'a.txt',
          status: 'replaced',
          etag: etagOf('new\n'),
          history: { kept: true, entryId: expect.any(String) },
        },
        expect.objectContaining({
          path: 'b.txt',
          error: expect.objectContaining({
            code: 'PRECONDITION_REQUIRED',
            params: { path: 'b.txt', reason: 'ifMatchMissing' },
          }),
        }),
        expect.objectContaining({
          path: 'c.txt',
          error: expect.objectContaining({ code: 'FILE_CHANGED' }),
        }),
      ]);
      expect(await readFile(at('a.txt'), 'utf8')).toBe('new\n');
      expect(await readFile(at('b.txt'), 'utf8')).toBe('old\n');
      expect(await readFile(at('c.txt'), 'utf8')).toBe('old\n');
      expect((await facts()).find((fact) => fact.subjectLabel === 'a.txt')).toMatchObject({
        kind: 'file.written',
        details: { hashBefore: etagOf('old\n'), hashAfter: etagOf('new\n'), source: 'upload' },
      });
    });

    it('keeps both under a new name, and the old file as it was — S-303', async () => {
      await writeFile(at('report.pdf'), 'mine');
      await writeFile(at('report copy.pdf'), 'mine too');

      const response = await upload([
        { path: 'report.pdf', content: 'yours', onConflict: 'keepBoth' },
      ]);

      expect(response.status).toBe(200);
      expect(response.body.items).toEqual([
        { path: 'report copy 2.pdf', status: 'renamed', etag: etagOf('yours') },
      ]);
      expect(await readFile(at('report.pdf'), 'utf8')).toBe('mine');
      expect(await readFile(at('report copy 2.pdf'), 'utf8')).toBe('yours');
    });

    it('refuses, whole and before a byte, a file past its ceiling — S-304', async () => {
      const response = await upload([
        { path: 'a.txt', content: 'a' },
        { path: 'big.bin', content: Buffer.alloc(65_537, 0x61) },
      ]);

      expect(response.status).toBe(413);
      expect(response.body.error).toMatchObject({
        code: 'FILE_TOO_LARGE',
        params: { path: 'big.bin', size: 65_537, limit: 65_536, measure: 'bytes' },
      });
      expect(await tree()).toEqual([]);
    });

    it('accepts a file exactly at its ceiling — fron', async () => {
      const response = await upload([{ path: 'edge.bin', content: Buffer.alloc(65_536, 0x61) }]);

      expect(response.status).toBe(200);
      expect((await readFile(at('edge.bin'))).length).toBe(65_536);
    });

    it('leaves nothing behind when the connection drops in the middle of a file — S-305', async () => {
      const boundary = 'rc-upload-boundary';
      const manifest = JSON.stringify([{ path: 'big.bin', size: 60_000 }]);
      const head = [
        `--${boundary}\r\nContent-Disposition: form-data; name="folder"\r\n\r\n${folder}\r\n`,
        `--${boundary}\r\nContent-Disposition: form-data; name="manifest"\r\n\r\n${manifest}\r\n`,
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="big.bin"\r\n`,
        'Content-Type: application/octet-stream\r\n\r\n',
      ].join('');
      const client = http.request(`${harness.url}/files/upload`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
          'content-length': String(Buffer.byteLength(head) + 60_000 + 100),
        },
      });
      client.on('error', () => undefined);
      const before = harness.log.withOp('files.stage').length;

      client.write(head);
      client.write(Buffer.alloc(30_000, 0x61));
      await vi.waitFor(async () => {
        expect(await temporariesUnder(folder)).toHaveLength(1);
      });
      client.destroy();

      await vi.waitFor(
        () => {
          expect(harness.log.withOp('files.stage').slice(before)).toContainEqual(
            expect.objectContaining({ outcome: 'refused', errorCode: 'INVALID_INPUT' }),
          );
        },
        { timeout: 5000 },
      );
      expect(await tree()).toEqual([]);
      expect(await facts()).toEqual([]);
    });

    it('cuts a part longer than declared, and keeps nothing of it', async () => {
      const response = await upload([
        { path: 'a.txt', content: 'abcdef', size: 3 },
        { path: 'b.txt', content: 'b' },
      ]);

      expect(response.status).toBe(207);
      expect(response.body.items[0]).toEqual({
        path: 'a.txt',
        status: 'failed',
        error: {
          code: 'INVALID_INPUT',
          messageKey: 'files.error.uploadSizeMismatch',
          params: { path: 'a.txt', declared: 3, received: 6 },
        },
      });
      expect(await tree()).toEqual(['b.txt']);
    });

    it('fails the items the body never carried', async () => {
      const response = await upload([{ path: 'a.txt', content: 'a' }], {
        manifest: JSON.stringify([
          { path: 'a.txt', size: 1 },
          { path: 'b.txt', size: 1 },
        ]),
      });

      expect(response.status).toBe(207);
      expect(response.body.items[1]).toMatchObject({
        path: 'b.txt',
        status: 'failed',
        error: { params: { declared: 1, received: 0 } },
      });
    });

    it('refuses a name with ../ or a leading /, and a directory that climbs out — S-306', async () => {
      const names = await upload([
        { path: '../evil.sh', content: 'x' },
        { path: '/etc/evil', content: 'y' },
      ]);
      const directory = await upload([{ path: 'a.txt', content: 'x' }], { directory: '../..' });

      expect(names.status).toBe(400);
      expect(names.body.error).toMatchObject({
        code: 'INVALID_INPUT',
        messageKey: 'files.error.invalidPath',
        details: [
          { field: 'manifest.0.path', rule: 'mustNotClimb' },
          { field: 'manifest.1.path', rule: 'mustBeRelative' },
        ],
      });
      expect(directory.status).toBe(403);
      expect(directory.body.error.code).toBe('WORKSPACE_NOT_ALLOWED');
      expect(await tree()).toEqual([]);
    });

    it('records file.created with source upload before the disk — S-307', async () => {
      await upload([{ path: 'a.txt', content: 'a\n' }]);

      expect(await facts()).toEqual([
        expect.objectContaining({
          kind: 'file.created',
          subjectId: at('a.txt'),
          subjectLabel: 'a.txt',
          details: {
            entryKind: 'file',
            sizeBytes: 2,
            hash: etagOf('a\n'),
            sensitive: false,
            source: 'upload',
          },
        }),
      ]);
    });

    it('writes nothing when the trail cannot take the fact — S-307', async () => {
      trail.failure = new Error('the database is gone');

      const response = await upload([
        { path: 'a.txt', content: 'a' },
        { path: 'b.txt', content: 'b' },
      ]);

      expect(response.status).toBe(503);
      expect(response.headers['retry-after']).toBe('5');
      expect(await tree()).toEqual([]);
    });

    it('re-creates a folder sent with its structure — S-356', async () => {
      await mkdir(at('dest'));

      const response = await upload(
        [
          { path: 'proj/readme.md', content: '# proj\n' },
          { path: 'proj/src/a.ts', content: 'a' },
          { path: 'proj/src/deep/b.ts', content: 'b' },
        ],
        { directory: 'dest' },
      );

      expect(response.status).toBe(200);
      expect(response.body.items.map((item: { path: string }) => item.path)).toEqual([
        'dest/proj/readme.md',
        'dest/proj/src/a.ts',
        'dest/proj/src/deep/b.ts',
      ]);
      expect(await tree()).toEqual([
        'dest',
        'dest/proj',
        'dest/proj/readme.md',
        'dest/proj/src',
        'dest/proj/src/a.ts',
        'dest/proj/src/deep',
        'dest/proj/src/deep/b.ts',
      ]);
      expect(await readFile(at('dest', 'proj', 'src', 'deep', 'b.ts'), 'utf8')).toBe('b');
      expect(await temporariesUnder(folder)).toEqual([]);
    });

    it('refuses a folder whose items climb, are absolute, carry a NUL or a reserved name — S-357', async () => {
      const response = await upload([
        { path: 'proj/ok.txt', content: 'ok' },
        { path: 'proj/../../x', content: 'x' },
        { path: '/proj/y', content: 'y' },
        { path: 'proj/z\0.txt', content: 'z' },
        { path: 'proj/CON/w.txt', content: 'w' },
      ]);

      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual([
        { field: 'manifest.1.path', rule: 'mustNotClimb' },
        { field: 'manifest.2.path', rule: 'mustBeRelative' },
        { field: 'manifest.3.path', rule: 'mustNotContainNul' },
        { field: 'manifest.4.path', rule: 'mustNotUseReservedName' },
      ]);
      expect(await tree()).toEqual([]);
    });

    it.each([
      ['items', 51, 1, { size: 51, limit: 50, measure: 'entries' }],
      ['bytes', 5, 60_000, { size: 300_000, limit: 262_144, measure: 'bytes' }],
    ])(
      'refuses a folder past its ceiling of %s before the first byte — S-358',
      async (_name, count, size, params) => {
        const files = Array.from({ length: count }, (_, index) => ({
          path: `proj/f${String(index)}`,
          content: Buffer.alloc(size, 0x61),
        }));

        const response = await upload(files);

        expect(response.status).toBe(413);
        expect(response.body.error).toMatchObject({ code: 'FILE_TOO_LARGE', params });
        expect(await tree()).toEqual([]);
      },
    );

    it('asks the second step for a sensitive file — D-15', async () => {
      const refused = await upload([{ path: '.mcp.json', content: '{}' }]);
      const confirmed = await upload([{ path: '.claude/settings.json', content: '{}' }], {
        confirmSensitive: 'true',
      });

      expect(refused.status).toBe(428);
      expect(refused.body.error.params).toMatchObject({ reason: 'sensitiveFile' });
      expect(confirmed.status).toBe(200);
      expect(await readFile(at('.claude', 'settings.json'), 'utf8')).toBe('{}');
    });

    it.each([
      ['a manifest that is not JSON', '{nope', 'manifest'],
      ['an empty manifest', '[]', 'manifest'],
      ['a negative size', JSON.stringify([{ path: 'a', size: -1 }]), 'manifest.0.size'],
    ])('refuses %s', async (_name, manifest, field) => {
      const response = await upload([{ path: 'a', content: 'a' }], { manifest });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
      expect(response.body.error.details).toContainEqual(expect.objectContaining({ field }));
    });

    it('refuses a body that is not multipart, and one without a token', async () => {
      const json = await authed(http_().post('/files/upload')).send({ folder });
      const anonymous = await http_()
        .post('/files/upload')
        .field('folder', folder)
        .attach('file', Buffer.from('a'), 'a');

      expect(json.status).toBe(400);
      expect(json.body.error.details).toEqual([{ field: 'body', rule: 'multipart' }]);
      expect(anonymous.status).toBe(401);
      expect(await tree()).toEqual([]);
    });

    it('refuses a directory that is not there, or not a folder', async () => {
      await writeFile(at('file.txt'), 'x');

      const missing = await upload([{ path: 'a', content: 'a' }], { directory: 'missing' });
      const file = await upload([{ path: 'a', content: 'a' }], { directory: 'file.txt' });

      expect(missing.status).toBe(404);
      expect(file.status).toBe(422);
      expect(file.body.error.code).toBe('WORKSPACE_NOT_A_DIRECTORY');
    });

    it('logs both edges of an upload, never what a file holds', async () => {
      const marker = 'marker-2b7e-never-logged';
      const before = harness.log.lines.length;

      await upload([{ path: 'm.txt', content: marker }]);

      const lines = harness.log.lines.slice(before);
      expect(lines.find((line) => line['op'] === 'files.upload')).toMatchObject({
        items: 1,
        failed: 0,
      });
      expect(
        lines.find((line) => line['op'] === 'files.place' && line['outcome'] === 'done'),
      ).toMatchObject({
        path: 'm.txt',
        bytes: marker.length,
      });
      expect(JSON.stringify(lines)).not.toContain(marker);
    });
  });

  describe('POST /files/upload/preflight — B-49', () => {
    it('says what is already where each item would go, with the version to replace', async () => {
      await mkdir(at('docs', 'sub'), { recursive: true });
      await writeFile(at('docs', 'a.md'), 'A');

      const response = await preflight(
        [
          { path: 'a.md', size: 1 },
          { path: 'b.md', size: 1 },
          { path: 'sub', size: 1 },
        ],
        'docs',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        items: [
          { path: 'docs/a.md', existing: { kind: 'file', etag: etagOf('A') } },
          { path: 'docs/b.md', existing: null },
          { path: 'docs/sub', existing: { kind: 'directory', etag: null } },
        ],
      });
      expect(await facts()).toEqual([]);
    });

    it('refuses what the upload would refuse, by the same rule', async () => {
      const names = await preflight([
        { path: '../x', size: 1 },
        { path: 'a/./b', size: 1 },
      ]);
      const large = await preflight([{ path: 'big', size: 65_537 }]);
      const malformed = await preflight([]);

      expect(names.status).toBe(400);
      expect(names.body.error.details).toEqual([
        { field: 'items.0.path', rule: 'mustNotClimb' },
        { field: 'items.1.path', rule: 'mustNotHaveEmptySegment' },
      ]);
      expect(large.status).toBe(413);
      expect(malformed.status).toBe(400);
    });
  });
});
