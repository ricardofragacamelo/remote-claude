import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';

import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { plantFolder } from '../../../../support/files/folder-fixture';

/** What a tree entry looks like on the wire, for the assertions that need its fields. */
interface EntryBody {
  readonly name: string;
  readonly path: string;
  readonly kind: string;
  readonly hidden: boolean;
  readonly outside: boolean;
  readonly targetKind: string | null;
  readonly unreadableName: boolean;
}

/**
 * `GET /files/tree` and `GET /files/content`, against the real application — plan 07, F1.
 *
 * The fence of the open folder, the tree, the contents with their `ETag`, and the log of every
 * request. The folder is `project/` under the root of the allowlist, with `outside/` beside it, so
 * every escape lands inside the same root: what is refused is the open folder's fence, not the
 * allowlist's (D-11).
 */
describe('the files HTTP surface — reading', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let token: string;
  let folder: string;
  let root: string;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;
    folder = plantFolder(root).folder;

    // Past the editing ceiling of the suite (64 KiB), exactly at it, and past the light mode (16 KiB).
    await writeFile(path.join(folder, 'huge.txt'), 'a'.repeat(65_537));
    await writeFile(path.join(folder, 'exact.txt'), 'a'.repeat(65_536));
    await writeFile(path.join(folder, 'large.txt'), 'a'.repeat(20_000));
    // A NUL past the first 8 KB is not what a binary looks like (S-45).
    await writeFile(path.join(folder, 'late-nul.txt'), `${'a'.repeat(8_192)}\0`);

    harness = await startTestApp(database.url, identity, (builder) => builder, allowlist);
    token = await identity.accessToken({ subject: SUBJECT });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());

  const get = (route: string, query: Record<string, string>): request.Test =>
    http()
      .get(`/files/${route}?${new URLSearchParams(query).toString()}`)
      .set('authorization', `Bearer ${token}`);

  const tree = (relative: string, at = folder): request.Test =>
    get('tree', { folder: at, path: relative });

  const content = (relative: string, extra: Record<string, string> = {}): request.Test =>
    get('content', { folder, path: relative, ...extra });

  const names = (body: { entries: readonly EntryBody[] }): string[] =>
    body.entries.map((entry) => entry.name);

  describe('the fence of the open folder — B-07', () => {
    it('reads a path inside the folder — S-14', async () => {
      const response = await content('src/a.ts');

      expect(response.status).toBe(200);
      expect(response.body.content).toBe('export const a = 1;\n');
    });

    it("lists the folder itself for '' — S-15", async () => {
      const response = await tree('');

      expect(response.status).toBe(200);
      expect(response.body.path).toBe('');
      expect(names(response.body)).toContain('src');
    });

    it.each([['../outside/secret.txt'], ['src/../../outside/secret.txt'], ['..']])(
      'refuses %s, which climbs out, before any I/O — S-16, S-20',
      async (relative) => {
        const response = await content(relative);

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('WORKSPACE_NOT_ALLOWED');
      },
    );

    it('normalises a climb that stays inside — S-17', async () => {
      const response = await content('docs/../src/a.ts');

      expect(response.status).toBe(200);
      expect(response.body.path).toBe('src/a.ts');
    });

    it('refuses an absolute path, a NUL and a backslash, all at once — S-18', async () => {
      const response = await content('/etc\\pass\0wd');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
      expect(response.body.error.details).toEqual([
        { field: 'path', rule: 'mustBeRelative' },
        { field: 'path', rule: 'mustNotContainNul' },
        { field: 'path', rule: 'mustNotContainBackslash' },
      ]);
    });

    it('refuses a folder outside the allowlist, and a root of somebody else — S-19', async () => {
      const elsewhere = await tree('', path.join(root, '..'));

      expect(elsewhere.status).toBe(403);
      expect(elsewhere.body.error.code).toBe('WORKSPACE_NOT_ALLOWED');

      const stranger = await identity.accessToken({ subject: 'auth|stranger' });
      const theirs = await http()
        .get(`/files/tree?${new URLSearchParams({ folder, path: '' }).toString()}`)
        .set('authorization', `Bearer ${stranger}`);

      expect(theirs.status).toBe(403);
      expect(theirs.body.error.code).toBe('FORBIDDEN');
    });

    it('follows a link that stays inside the folder — S-21', async () => {
      const response = await content('link-inside.ts');

      expect(response.status).toBe(200);
      expect(response.body.content).toBe('export const a = 1;\n');
    });

    it('never follows a link out of the folder, though it stays in the root — S-22', async () => {
      const response = await content('link-outside.txt');

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('WORKSPACE_NOT_ALLOWED');
    });

    it('refuses a folder on the way that leads out — S-23', async () => {
      const read = await content('escape/secret.txt');
      const listed = await tree('escape');

      expect(read.status).toBe(403);
      expect(listed.status).toBe(403);
    });

    it('refuses a loop of links without hanging — S-24', async () => {
      const response = await content('loop-a');

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('FILE_OPERATION_INVALID');
      expect(response.body.error.params.reason).toBe('symlinkLoop');
    });

    it('refuses a folder that left the allowlist, at the very next request — S-26', async () => {
      // `process.emit` runs exactly the listeners the process has — the reload of the allowlist —
      // as plan 06 proves it (allowlist-reload.spec.ts).
      const original = await readFile(harness.allowlist.file, 'utf8');
      expect((await tree('')).status).toBe(200);

      await writeFile(
        harness.allowlist.file,
        `roots:\n  - path: ${path.join(root, 'outside')}\n    label: Other\n    users:\n      - ${SUBJECT}\n`,
      );
      process.emit('SIGHUP', 'SIGHUP');

      try {
        const refused = await tree('');

        expect(refused.status).toBe(403);
        expect(refused.body.error.code).toBe('WORKSPACE_NOT_ALLOWED');
      } finally {
        await writeFile(harness.allowlist.file, original);
        process.emit('SIGHUP', 'SIGHUP');
      }

      expect((await tree('')).status).toBe(200);
    });

    it('refuses a folder that was removed from the disk — S-27', async () => {
      const gone = path.join(root, 'gone');
      await mkdir(gone);
      await rm(gone, { recursive: true });

      const response = await tree('', gone);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('WORKSPACE_NOT_FOUND');
    });
  });

  describe('GET /files/tree — B-08', () => {
    it('lists one level: folders first, then names ignoring case and in natural order — S-28', async () => {
      const response = await tree('src');

      expect(response.status).toBe(200);
      expect(names(response.body)).toEqual(['a.ts', 'B.ts', 'item2.ts', 'item10.ts']);
      expect(response.body.entries[0]).toMatchObject({
        path: 'src/a.ts',
        kind: 'file',
        size: 20,
        hidden: false,
        outside: false,
        targetKind: null,
      });
      expect(Number.isNaN(Date.parse(response.body.entries[0].mtime))).toBe(false);

      const top = (await tree('')).body as { entries: readonly EntryBody[] };
      const firstFile = top.entries.findIndex((entry) => entry.kind === 'file');
      const lastFolder = top.entries.findLastIndex(
        (entry) => entry.kind === 'directory' || entry.targetKind === 'directory',
      );
      expect(lastFolder).toBeLessThan(firstFile);
    });

    it('answers an empty folder with no entries — S-29', async () => {
      const response = await tree('empty');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ entries: [], truncated: false });
    });

    it('refuses a path that is a file — S-31', async () => {
      const response = await tree('readme.md');

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('WORKSPACE_NOT_A_DIRECTORY');
    });

    it('refuses a folder that is not there — S-32', async () => {
      const response = await tree('nothing-here');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('FILE_NOT_FOUND');
    });

    it('refuses a folder this process may not read — S-33', async () => {
      const closed = path.join(folder, 'closed');
      await mkdir(closed);
      await chmod(closed, 0o000);

      try {
        const response = await tree('closed');

        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe('WORKSPACE_DIRECTORY_UNREADABLE');
      } finally {
        await chmod(closed, 0o755);
        await rm(closed, { recursive: true });
      }
    });

    it('marks a link out of the folder, and says where a broken one leads — S-34', async () => {
      const entries = (await tree('')).body.entries as readonly EntryBody[];
      const byName = (name: string): EntryBody | undefined =>
        entries.find((entry) => entry.name === name);

      expect(byName('link-outside.txt')).toMatchObject({
        kind: 'symlink',
        outside: true,
        targetKind: null,
      });
      expect(byName('escape')).toMatchObject({ kind: 'symlink', outside: true });
      expect(byName('broken')).toMatchObject({ kind: 'symlink', targetKind: 'missing' });
      expect(byName('loop-a')).toMatchObject({ kind: 'symlink', targetKind: 'missing' });
      expect(byName('link-to-src')).toMatchObject({
        kind: 'symlink',
        outside: false,
        targetKind: 'directory',
      });
    });

    it('lists a FIFO as other, without opening it — S-35', async () => {
      const entries = (await tree('')).body.entries as readonly EntryBody[];

      expect(entries.find((entry) => entry.name === 'pipe')?.kind).toBe('other');
    });

    it('keeps a name with spaces and accents, and marks one that is not UTF-8 — S-37', async () => {
      const entries = (await tree('')).body.entries as readonly EntryBody[];

      expect(entries.find((entry) => entry.name === 'açaí café.md')?.unreadableName).toBe(false);
      expect(entries.filter((entry) => entry.unreadableName)).toHaveLength(1);
    });

    it('marks what the explorer hides rather than leaving it out — S-38', async () => {
      const entries = (await tree('')).body.entries as readonly EntryBody[];
      const hidden = entries.filter((entry) => entry.hidden).map((entry) => entry.name);

      expect(hidden.sort()).toEqual(['.DS_Store', '.git']);
    });

    it('answers the same body twice when nothing changed — S-39', async () => {
      expect((await tree('src')).body).toEqual((await tree('src')).body);
    });
  });

  describe('GET /files/content — B-09', () => {
    it('answers the text, its strong ETag, the encoding, the mark, the endings, size and date — S-40', async () => {
      const response = await content('readme.md');

      expect(response.status).toBe(200);
      expect(response.headers['etag']).toMatch(/^"[0-9a-f]{64}"$/);
      expect(response.body).toMatchObject({
        path: 'readme.md',
        content: '# Project\n',
        etag: response.headers['etag'],
        encoding: 'utf8',
        bom: false,
        eol: 'lf',
        size: 10,
        largeFile: false,
      });
    });

    it('answers an empty file with the ETag of nothing — S-41', async () => {
      const response = await content('empty.txt');

      expect(response.body).toMatchObject({
        content: '',
        etag: '"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"',
      });
    });

    it('opens a file exactly at the ceiling and refuses one byte past it — S-42', async () => {
      expect((await content('exact.txt')).status).toBe(200);

      const response = await content('huge.txt');

      expect(response.status).toBe(413);
      expect(response.body.error.code).toBe('FILE_TOO_LARGE');
      expect(response.body.error.params).toMatchObject({
        size: 65_537,
        limit: 65_536,
        measure: 'bytes',
      });
    });

    it('marks a file past the light-mode threshold — S-43', async () => {
      expect((await content('large.txt')).body.largeFile).toBe(true);
    });

    it('refuses a binary — S-44', async () => {
      const response = await content('binary.bin');

      expect(response.status).toBe(415);
      expect(response.body.error).toMatchObject({
        code: 'FILE_NOT_TEXT',
        params: { reason: 'binary' },
      });
    });

    it('reads a NUL past the first 8 KB as text — S-45', async () => {
      expect((await content('late-nul.txt')).status).toBe(200);
    });

    it('refuses invalid UTF-8 rather than guess — S-46', async () => {
      const response = await content('latin1.txt');

      expect(response.status).toBe(415);
      expect(response.body.error.params.reason).toBe('encoding');
    });

    it('takes the mark of UTF-8 out of the text, and says it was there — S-47', async () => {
      expect((await content('bom.txt')).body).toMatchObject({
        content: 'com marca\n',
        bom: true,
        encoding: 'utf8',
      });
    });

    it.each([
      ['utf16le.txt', 'utf16le'],
      ['utf16be.txt', 'utf16be'],
    ])('decodes %s by its mark — S-48', async (file, encoding) => {
      expect((await content(file)).body).toMatchObject({ content: 'olá\n', encoding, bom: true });
    });

    it('reopens a file with the encoding asked for — S-49', async () => {
      const response = await content('latin1.txt', { encoding: 'windows-1252' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ content: 'ação', encoding: 'windows1252' });
    });

    it('refuses an encoding that does not exist — S-50', async () => {
      const response = await content('readme.md', { encoding: 'klingon-8' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
      expect(response.body.error.details).toEqual([{ field: 'encoding', rule: 'unknownEncoding' }]);
    });

    it('reports the line endings — S-51', async () => {
      expect((await content('crlf.txt')).body.eol).toBe('crlf');
      expect((await content('mixed.txt')).body.eol).toBe('mixed');
    });

    it('answers 304 with no body for the version the client holds, 200 for another — S-52', async () => {
      const first = await content('readme.md');
      const again = await content('readme.md').set('if-none-match', first.headers['etag'] ?? '');
      const other = await content('readme.md').set('if-none-match', '"another"');

      expect(again.status).toBe(304);
      expect(again.text).toBe('');
      expect(again.headers['etag']).toBe(first.headers['etag']);
      expect(other.status).toBe(200);
    });

    it('refuses a folder — S-56', async () => {
      const response = await content('src');

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('FILE_NOT_A_FILE');
    });

    it('refuses a FIFO without waiting for a writer — S-57', async () => {
      const response = await content('pipe');

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('FILE_NOT_A_FILE');
    });

    it('refuses a file this process may not read — S-58', async () => {
      const closed = path.join(folder, 'closed.txt');
      await writeFile(closed, 'no');
      await chmod(closed, 0o000);

      try {
        const response = await content('closed.txt');

        expect(response.status).toBe(422);
        expect(response.body.error).toMatchObject({
          code: 'FILE_ACCESS_DENIED',
          params: { reason: 'permission' },
        });
      } finally {
        await rm(closed, { force: true });
      }
    });
  });

  describe('the edge — B-10', () => {
    it.each([
      ['tree', { folder: '/x', path: '' }],
      ['content', { folder: '/x', path: 'a' }],
    ])('answers 401 without a credential on %s — S-59', async (route, query) => {
      const response = await http().get(`/files/${route}?${new URLSearchParams(query).toString()}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('answers 401 without a credential on the writes too — S-59', async () => {
      expect((await http().put('/files/content').send({})).status).toBe(401);
      expect((await http().post('/files').send({})).status).toBe(401);
      expect((await http().post('/files/move').send({})).status).toBe(401);
      expect((await http().post('/files/copy').send({})).status).toBe(401);
      expect((await http().delete('/files?folder=/x&path=a')).status).toBe(401);
    });

    it('names every invalid field at once — S-60', async () => {
      const response = await http()
        .get('/files/content?path[]=a&path[]=b')
        .set('authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(
        (response.body.error.details as { field: string }[]).map((detail) => detail.field).sort(),
      ).toEqual(['folder', 'path']);
    });

    it('logs folder, path and bytes of a read, never what the file holds — S-61, S-09', async () => {
      // ADR-015: a person reading is in the log and not in the trail; the contents are in neither.
      const marker = 'marker-7f3c9e-never-logged';
      await writeFile(path.join(folder, 'marked.txt'), `${marker}\n`);
      const before = harness.log.lines.length;

      expect((await content('marked.txt')).status).toBe(200);

      const lines = harness.log.lines.slice(before);
      const read = lines.find((line) => line['op'] === 'files.read' && line['outcome'] === 'done');

      expect(read).toMatchObject({ folder, path: 'marked.txt', bytes: marker.length + 1 });
      expect(JSON.stringify(lines)).not.toContain(marker);
    });
  });
});
