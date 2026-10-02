import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  chmod,
  link,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
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

/** One fact of the trail, as `GET /audit-events` answers it. */
interface FactBody {
  readonly id: string;
  readonly kind: string;
  readonly subjectId: string;
  readonly subjectLabel: string;
  readonly details: Readonly<Record<string, unknown>>;
}

/**
 * The person's writes through the real application — plan 07, F2.
 *
 * Saving, creating, renaming, moving, copying and deleting inside an open folder: never over
 * Claude's work, never over another entry, never through a link out, and always in the trail
 * **before** the disk. Each test plants what it needs in a folder of its own, so none depends on
 * another's leftovers.
 */
describe('the files HTTP surface — writing', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let trail: SwitchableAuditEvents;
  let token: string;
  let root: string;
  let folder: string;
  let outside: string;
  let counter = 0;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;
    outside = path.join(root, 'outside');
    await mkdir(outside);
    await writeFile(path.join(outside, 'secret.txt'), 'outside\n');

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

  const http = (): request.Agent => request(harness.app.getHttpServer());
  const authed = <T extends request.Test>(test: T): T =>
    test.set('authorization', `Bearer ${token}`) as T;
  const at = (...segments: string[]): string => path.join(folder, ...segments);

  const read = (relative: string): request.Test =>
    authed(
      http().get(`/files/content?${new URLSearchParams({ folder, path: relative }).toString()}`),
    );

  const save = (
    relative: string,
    content: string,
    ifMatch: string | null,
    extra: Record<string, unknown> = {},
  ): request.Test => {
    const test = authed(http().put('/files/content')).send({
      folder,
      path: relative,
      content,
      ...extra,
    });

    return ifMatch === null ? test : test.set('if-match', ifMatch);
  };

  const create = (body: Record<string, unknown>): request.Test =>
    authed(http().post('/files')).send({ folder, ...body });

  const move = (from: string, to: string, extra: Record<string, unknown> = {}): request.Test =>
    authed(http().post('/files/move')).send({ folder, from, to, ...extra });

  const copy = (from: string, to: string): request.Test =>
    authed(http().post('/files/copy')).send({ folder, from, to });

  const remove = (relative: string, extra: Record<string, string> = {}): request.Test =>
    authed(
      http().delete(
        `/files?${new URLSearchParams({ folder, path: relative, ...extra }).toString()}`,
      ),
    );

  /** The file facts of the trail, newest first. */
  const facts = async (): Promise<FactBody[]> =>
    (await authed(http().get('/audit-events?kind=file.&limit=100'))).body.events as FactBody[];

  /** The facts about one path of this test's folder, oldest first. */
  const factsAbout = async (relative: string): Promise<FactBody[]> =>
    (await facts())
      .filter((fact) => fact.subjectId.startsWith(`${folder}/`) && fact.subjectLabel === relative)
      .reverse();

  describe('PUT /files/content — B-11', () => {
    it('saves over the version it names, and answers the new one — S-62', async () => {
      await writeFile(at('a.ts'), 'one\n');

      const response = await save('a.ts', 'two\n', etagOf('one\n'));

      expect(response.status).toBe(200);
      expect(response.headers['etag']).toBe(etagOf('two\n'));
      expect(response.body).toEqual({
        path: 'a.ts',
        etag: etagOf('two\n'),
        size: 4,
        history: { kept: true, entryId: expect.any(String) },
      });
      expect(await readFile(at('a.ts'), 'utf8')).toBe('two\n');
    });

    it('refuses a save with no If-Match, or with *, and touches nothing — S-63', async () => {
      await writeFile(at('a.ts'), 'one\n');

      for (const ifMatch of [null, '*']) {
        const response = await save('a.ts', 'two\n', ifMatch);

        expect(response.status).toBe(428);
        expect(response.body.error).toMatchObject({
          code: 'PRECONDITION_REQUIRED',
          params: { reason: 'ifMatchMissing' },
        });
      }

      expect(await readFile(at('a.ts'), 'utf8')).toBe('one\n');
    });

    it('refuses to save over what Claude wrote since, and says what is there now — S-64', async () => {
      await writeFile(at('a.ts'), 'one\n');
      const opened = await read('a.ts');
      await writeFile(at('a.ts'), 'written by Claude\n');

      const response = await save('a.ts', 'mine\n', opened.headers['etag'] ?? '');

      expect(response.status).toBe(412);
      expect(response.headers['etag']).toBe(etagOf('written by Claude\n'));
      expect(response.body.error).toMatchObject({
        code: 'FILE_CHANGED',
        params: { currentEtag: etagOf('written by Claude\n') },
      });
      expect(await readFile(at('a.ts'), 'utf8')).toBe('written by Claude\n');
    });

    it('never matches a weak tag — S-65', async () => {
      await writeFile(at('a.ts'), 'one\n');

      expect((await save('a.ts', 'two\n', `W/${etagOf('one\n')}`)).status).toBe(412);
    });

    it('answers the retry of a save whose answer got lost without writing again — S-66', async () => {
      await writeFile(at('a.ts'), 'one\n');

      const first = await save('a.ts', 'two\n', etagOf('one\n'));
      const retry = await save('a.ts', 'two\n', etagOf('one\n'));

      expect(first.status).toBe(200);
      expect(retry.status).toBe(200);
      expect(retry.body.etag).toBe(first.body.etag);
      expect((await factsAbout('a.ts')).map((fact) => fact.kind)).toEqual(['file.written']);
    });

    it('lets one of two saves over the same version win, and refuses the other — S-67', async () => {
      await writeFile(at('a.ts'), 'one\n');

      const [left, right] = await Promise.all([
        save('a.ts', 'left\n', etagOf('one\n')),
        save('a.ts', 'right\n', etagOf('one\n')),
      ]);

      expect([left.status, right.status].sort()).toEqual([200, 412]);
      expect(['left\n', 'right\n']).toContain(await readFile(at('a.ts'), 'utf8'));
    });

    it('never re-creates a file that was deleted — S-68', async () => {
      await writeFile(at('a.ts'), 'one\n');
      await rm(at('a.ts'));

      const response = await save('a.ts', 'two\n', etagOf('one\n'));

      expect(response.status).toBe(412);
      expect(response.body.error.params.currentEtag).toBeNull();
      await expect(stat(at('a.ts'))).rejects.toThrow();
    });

    it('sweeps the temporary a dead process left, at the next write in the folder — S-70', async () => {
      await writeFile(at('a.ts'), 'one\n');
      const orphan = at('.a.ts.rc-01J9ZQ3W7F8M6N5P4Q3R2S1T0V.tmp');
      await writeFile(orphan, 'half');

      expect((await save('a.ts', 'two\n', etagOf('one\n'))).status).toBe(200);
      expect(await readdir(folder)).toEqual(['a.ts']);
    });

    it('keeps the mode of the file — S-71', async () => {
      await writeFile(at('run.sh'), '#!/bin/sh\n', { mode: 0o755 });
      await chmod(at('run.sh'), 0o755);

      await save('run.sh', '#!/bin/sh\necho\n', etagOf('#!/bin/sh\n'));

      expect((await stat(at('run.sh'))).mode & 0o777).toBe(0o755);
    });

    it('writes the line endings as they came, and the mark when asked — S-72', async () => {
      const marked = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('a\r\nb\r\n')]);
      await writeFile(at('crlf.txt'), marked);

      const response = await save('crlf.txt', 'a\r\nb\r\nc\r\n', etagOf(marked), { bom: true });

      expect(response.status).toBe(200);
      expect(await readFile(at('crlf.txt'))).toEqual(
        Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('a\r\nb\r\nc\r\n')]),
      );
    });

    it('saves in the encoding it was opened in, and refuses what it cannot hold — S-73', async () => {
      const latin = Buffer.from([0x61, 0xe7, 0xe3, 0x6f]);
      await writeFile(at('latin.txt'), latin);

      const saved = await save('latin.txt', 'ação!', etagOf(latin), { encoding: 'windows-1252' });

      expect(saved.status).toBe(200);
      expect(await readFile(at('latin.txt'))).toEqual(Buffer.from([0x61, 0xe7, 0xe3, 0x6f, 0x21]));

      const refused = await save('latin.txt', 'emoji 🙂', saved.body.etag, {
        encoding: 'windows-1252',
      });

      expect(refused.status).toBe(422);
      expect(refused.body.error).toMatchObject({
        code: 'FILE_NOT_ENCODABLE',
        params: { encoding: 'windows1252' },
      });
      expect(await readFile(at('latin.txt'))).toEqual(Buffer.from([0x61, 0xe7, 0xe3, 0x6f, 0x21]));
    });

    it('writes through a link inside the folder, and keeps the link — S-74', async () => {
      await writeFile(at('target.ts'), 'one\n');
      await symlink(at('target.ts'), at('link.ts'));

      expect((await save('link.ts', 'two\n', etagOf('one\n'))).status).toBe(200);
      expect(await readFile(at('target.ts'), 'utf8')).toBe('two\n');
      expect((await lstat(at('link.ts'))).isSymbolicLink()).toBe(true);
    });

    it('does not break a hard link in silence — S-75', async () => {
      await writeFile(at('one.ts'), 'one\n');
      await link(at('one.ts'), at('other.ts'));

      expect((await save('one.ts', 'two\n', etagOf('one\n'))).status).toBe(200);
      expect(await readFile(at('other.ts'), 'utf8')).toBe('two\n');
      expect((await stat(at('one.ts'))).ino).toBe((await stat(at('other.ts'))).ino);
    });

    it('refuses a text past the editing ceiling and touches nothing — S-76', async () => {
      await writeFile(at('a.ts'), 'one\n');

      const response = await save('a.ts', 'a'.repeat(65_537), etagOf('one\n'));

      expect(response.status).toBe(413);
      expect(response.body.error).toMatchObject({
        code: 'FILE_TOO_LARGE',
        params: { size: 65_537, limit: 65_536, measure: 'bytes' },
      });
      expect(await readFile(at('a.ts'), 'utf8')).toBe('one\n');
    });

    it('refuses a body the parser of /files will not take — S-76', async () => {
      const response = await save('a.ts', 'a'.repeat(200_000), etagOf('one\n'));

      expect(response.status).toBe(413);
      expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('keeps the parser of every other route, and its limit — the /files one is its own', async () => {
      // Nest skips its own JSON parser when one named `jsonParser` is already on the stack; the one
      // of /files once was, and every other route lost its body.
      const parsed = await authed(http().post('/workspaces/open-folders')).send({ path: folder });
      const tooBig = await authed(http().post('/workspaces/open-folders')).send({
        path: folder,
        padding: 'a'.repeat(200_000),
      });

      expect(parsed.status).toBe(201);
      expect(tooBig.status).toBe(413);
      expect(tooBig.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('refuses a file the system will not let this process write — S-77', async () => {
      await writeFile(at('locked.ts'), 'one\n');
      await chmod(at('locked.ts'), 0o444);

      const response = await save('locked.ts', 'two\n', etagOf('one\n'));

      expect(response.status).toBe(422);
      expect(response.body.error).toMatchObject({
        code: 'FILE_ACCESS_DENIED',
        params: { reason: 'permission' },
      });
      expect(await readFile(at('locked.ts'), 'utf8')).toBe('one\n');
    });

    it('asks for the second step before writing a file that changes what Claude may do — S-79', async () => {
      await mkdir(at('.claude'));
      await writeFile(at('.claude', 'settings.json'), '{}\n');

      const refused = await save('.claude/settings.json', '{"a":1}\n', etagOf('{}\n'));

      expect(refused.status).toBe(428);
      expect(refused.body.error.params.reason).toBe('sensitiveFile');
      expect(await readFile(at('.claude', 'settings.json'), 'utf8')).toBe('{}\n');

      const confirmed = await save('.claude/settings.json', '{"a":1}\n', etagOf('{}\n'), {
        confirmSensitive: true,
      });

      expect(confirmed.status).toBe(200);
      expect((await factsAbout('.claude/settings.json')).at(-1)?.details).toMatchObject({
        sensitive: true,
      });
    });
  });

  describe('POST /files — B-12', () => {
    it('creates an empty file: 201, Location and ETag — S-80', async () => {
      const response = await create({ path: 'new.ts', kind: 'file' });

      expect(response.status).toBe(201);
      expect(response.headers['location']).toBe(
        `/files/content?${new URLSearchParams({ folder, path: 'new.ts' }).toString()}`,
      );
      expect(response.headers['etag']).toBe(etagOf(''));
      expect(response.body).toEqual({ path: 'new.ts', etag: etagOf('') });
    });

    it('creates a file with what it starts with — S-81', async () => {
      const response = await create({
        path: 'from-template.md',
        kind: 'file',
        content: '# Title\n',
      });

      expect(response.body.etag).toBe(etagOf('# Title\n'));
      expect(await readFile(at('from-template.md'), 'utf8')).toBe('# Title\n');
    });

    it('creates a folder — S-82', async () => {
      const response = await create({ path: 'folder', kind: 'directory' });

      expect(response.status).toBe(201);
      expect(response.headers['location']).toContain('/files/tree?');
      expect(response.body.etag).toBeNull();
      expect((await stat(at('folder'))).isDirectory()).toBe(true);
    });

    it('creates the folders above it that are missing — S-83', async () => {
      expect((await create({ path: 'a/b/c.ts', kind: 'file' })).status).toBe(201);
      expect((await stat(at('a', 'b', 'c.ts'))).isFile()).toBe(true);
    });

    it('never creates over what is there — S-84', async () => {
      await writeFile(at('there.ts'), 'mine\n');

      const response = await create({ path: 'there.ts', kind: 'file', content: 'other\n' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('FILE_EXISTS');
      expect(await readFile(at('there.ts'), 'utf8')).toBe('mine\n');
    });

    it('answers one 201 and one 409 to two creates of one path — S-85', async () => {
      const [left, right] = await Promise.all([
        create({ path: 'race.ts', kind: 'file', content: 'left\n' }),
        create({ path: 'race.ts', kind: 'file', content: 'right\n' }),
      ]);

      expect([left.status, right.status].sort()).toEqual([201, 409]);
    });

    it('refuses an empty name, . or .., a NUL, and a segment past 255 bytes, all at once — S-86, S-87', async () => {
      for (const [raw, rules] of [
        ['a/..', ['mustNameAnEntry']],
        ['a/.', ['mustNameAnEntry']],
        ['bad\0name', ['mustNotContainNul']],
        [`${'n'.repeat(256)}/x`, ['segmentTooLong']],
      ] as const) {
        const response = await create({ path: raw, kind: 'file' });

        expect(response.status).toBe(400);
        expect(
          (response.body.error.details as { rule: string }[]).map((detail) => detail.rule),
        ).toEqual(rules);
      }

      expect((await create({ path: 'n'.repeat(255), kind: 'file' })).status).toBe(201);
    });

    it('answers the retry of a create with 409 and the ETag of what it sent — S-88', async () => {
      const first = await create({ path: 'once.ts', kind: 'file', content: 'x\n' });
      const retry = await create({ path: 'once.ts', kind: 'file', content: 'x\n' });

      expect(retry.status).toBe(409);
      expect(retry.body.error.params.currentEtag).toBe(first.body.etag);
      expect(retry.headers['etag']).toBe(first.body.etag);
    });
  });

  describe('POST /files/move — B-13', () => {
    it('renames a file: the old name is gone, the new one has the same ETag — S-89', async () => {
      await writeFile(at('old.ts'), 'one\n');

      const response = await move('old.ts', 'new.ts');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ path: 'new.ts', etag: etagOf('one\n') });
      await expect(stat(at('old.ts'))).rejects.toThrow();
      expect(await readFile(at('new.ts'), 'utf8')).toBe('one\n');
    });

    it('moves a folder with what is inside — S-90', async () => {
      await mkdir(at('src', 'inner'), { recursive: true });
      await writeFile(at('src', 'inner', 'x.ts'), 'x');
      await mkdir(at('lib'));

      expect((await move('src', 'lib/src')).status).toBe(200);
      expect(await readFile(at('lib', 'src', 'inner', 'x.ts'), 'utf8')).toBe('x');
    });

    it('never overwrites the destination — S-91', async () => {
      await writeFile(at('a.ts'), 'a\n');
      await writeFile(at('b.ts'), 'b\n');
      await mkdir(at('d1'));
      await mkdir(at('d2'));

      const file = await move('a.ts', 'b.ts');
      const folderOverFolder = await move('d1', 'd2');

      expect(file.status).toBe(409);
      expect(file.body.error.params.currentEtag).toBe(etagOf('b\n'));
      expect(folderOverFolder.status).toBe(409);
      expect(await readFile(at('b.ts'), 'utf8')).toBe('b\n');
      expect(await readFile(at('a.ts'), 'utf8')).toBe('a\n');
    });

    it('refuses a folder into itself — S-92', async () => {
      await mkdir(at('src'));

      const response = await move('src', 'src/inside');

      expect(response.status).toBe(422);
      expect(response.body.error).toMatchObject({
        code: 'FILE_OPERATION_INVALID',
        params: { reason: 'intoItself' },
      });
    });

    it('refuses the open folder itself as the source — S-93', async () => {
      const response = await authed(http().post('/files/move')).send({
        folder,
        from: '.',
        to: 'x',
      });

      expect(response.status).toBe(422);
      expect(response.body.error.params.reason).toBe('openFolder');
    });

    it('refuses a destination outside the open folder — S-94', async () => {
      await writeFile(at('a.ts'), 'a');

      const response = await move('a.ts', '../outside/a.ts');

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('WORKSPACE_NOT_ALLOWED');
    });

    it('lets one of two moves to one destination win, and loses nothing — S-96', async () => {
      await writeFile(at('left.ts'), 'left\n');
      await writeFile(at('right.ts'), 'right\n');

      const [left, right] = await Promise.all([
        move('left.ts', 'same.ts'),
        move('right.ts', 'same.ts'),
      ]);

      expect([left.status, right.status].sort()).toEqual([200, 409]);
      const files = (await readdir(folder)).sort();
      expect(files).toHaveLength(2);
      expect(files).toContain('same.ts');
    });

    it('answers the retry of a move with 404 on the source — S-97', async () => {
      await writeFile(at('a.ts'), 'a');
      await move('a.ts', 'b.ts');

      const retry = await move('a.ts', 'b.ts');

      expect(retry.status).toBe(404);
      expect(retry.body.error.code).toBe('FILE_NOT_FOUND');
    });

    it('refuses a move whose If-Match is not the version on disk — S-98', async () => {
      await writeFile(at('a.ts'), 'now\n');

      const response = await move('a.ts', 'b.ts', { ifMatch: etagOf('then\n') });

      expect(response.status).toBe(412);
      expect((await move('a.ts', 'b.ts', { ifMatch: etagOf('now\n') })).status).toBe(200);
    });

    it('renames only the case — S-99', async () => {
      await writeFile(at('case.ts'), 'c');

      expect((await move('case.ts', 'Case.ts')).status).toBe(200);
      expect(await readdir(folder)).toEqual(['Case.ts']);
    });
  });

  describe('POST /files/copy — B-14', () => {
    it('copies a file: 201 with the ETag of the original — S-100', async () => {
      await writeFile(at('a.ts'), 'one\n');

      const response = await copy('a.ts', 'a copy.ts');

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ path: 'a copy.ts', etag: etagOf('one\n') });
      expect(await readFile(at('a copy.ts'), 'utf8')).toBe('one\n');
    });

    it('copies a folder all the way down, and a link as a link — S-101', async () => {
      await mkdir(at('src', 'deep'), { recursive: true });
      await writeFile(at('src', 'deep', 'x.ts'), 'x');
      await symlink(outside, at('src', 'out'));

      const response = await copy('src', 'src-copy');

      expect(response.status).toBe(201);
      expect(response.headers['location']).toContain('/files/tree?');
      expect(await readFile(at('src-copy', 'deep', 'x.ts'), 'utf8')).toBe('x');
      expect(await readlink(at('src-copy', 'out'))).toBe(outside);
      expect(await readdir(outside)).toEqual(['secret.txt']);
    });

    it('never copies over the destination — S-102', async () => {
      await writeFile(at('a.ts'), 'a');
      await writeFile(at('b.ts'), 'b');

      expect((await copy('a.ts', 'b.ts')).status).toBe(409);
      expect(await readFile(at('b.ts'), 'utf8')).toBe('b');
    });

    it('refuses a folder into itself — S-106', async () => {
      await mkdir(at('src'));

      const response = await copy('src', 'src/again');

      expect(response.status).toBe(422);
      expect(response.body.error.params.reason).toBe('intoItself');
    });
  });

  describe('DELETE /files — B-15', () => {
    it('deletes a file — S-107', async () => {
      await writeFile(at('a.ts'), 'a');

      expect((await remove('a.ts')).status).toBe(204);
      await expect(stat(at('a.ts'))).rejects.toThrow();
    });

    it('deletes an empty folder — S-108', async () => {
      await mkdir(at('empty'));

      expect((await remove('empty')).status).toBe(204);
    });

    it('answers a folder with something in it with how much would go — S-109', async () => {
      await mkdir(at('full', 'inner'), { recursive: true });
      await writeFile(at('full', 'inner', 'a.ts'), 'a');
      await writeFile(at('full', 'b.ts'), 'b');

      const response = await remove('full');

      expect(response.status).toBe(409);
      expect(response.body.error).toMatchObject({
        code: 'DIRECTORY_NOT_EMPTY',
        params: { entryCount: 3, entryCountCapped: false },
      });
      expect((await remove('full', { recursive: 'true' })).body.error).toMatchObject({
        code: 'PRECONDITION_REQUIRED',
        params: { reason: 'expectedEntriesMissing' },
      });
      expect((await remove('full', { recursive: 'true', expectedEntries: '3' })).status).toBe(204);
    });

    it('deletes nothing when the count changed after it was shown — S-110', async () => {
      await mkdir(at('full'));
      await writeFile(at('full', 'a.ts'), 'a');
      await writeFile(at('full', 'b.ts'), 'b');
      // Claude creates a file between the confirmation and the delete.
      await writeFile(at('full', 'c.ts'), 'c');

      const response = await remove('full', { recursive: 'true', expectedEntries: '2' });

      expect(response.status).toBe(412);
      expect(await readdir(at('full'))).toHaveLength(3);
    });

    it('refuses the open folder itself — S-115', async () => {
      const response = await remove('.');

      expect(response.status).toBe(422);
      expect(response.body.error.params.reason).toBe('openFolder');
    });

    it('answers 404 for what is not there — S-112', async () => {
      const response = await remove('ghost.ts');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('FILE_NOT_FOUND');
    });

    it('removes a link and leaves what it pointed at, even outside — S-113', async () => {
      await symlink(path.join(outside, 'secret.txt'), at('out.txt'));

      expect((await remove('out.txt')).status).toBe(204);
      expect(await readFile(path.join(outside, 'secret.txt'), 'utf8')).toBe('outside\n');
    });

    it('never goes through a link when deleting a folder — S-114', async () => {
      await mkdir(at('tree'));
      await symlink(outside, at('tree', 'out'));

      expect((await remove('tree', { recursive: 'true', expectedEntries: '1' })).status).toBe(204);
      expect(await readdir(outside)).toEqual(['secret.txt']);
    });
  });

  describe('the person in the trail — B-16', () => {
    it('records every write before the disk, with paths, sizes and hashes, never the contents — S-116', async () => {
      const marker = 'marker-a91f-never-in-the-trail';

      await create({ path: 'a.ts', kind: 'file', content: `${marker}\n` });
      await save('a.ts', `${marker}!\n`, etagOf(`${marker}\n`));
      await copy('a.ts', 'b.ts');
      await move('b.ts', 'c.ts');
      await remove('c.ts');

      const mine = (await facts()).filter((fact) => fact.subjectId.startsWith(`${folder}/`));

      expect(mine.map((fact) => fact.kind).reverse()).toEqual([
        'file.created',
        'file.written',
        'file.copied',
        'file.moved',
        'file.deleted',
      ]);
      expect(mine.at(-1)).toMatchObject({
        subjectId: at('a.ts'),
        subjectLabel: 'a.ts',
        details: { entryKind: 'file', hash: etagOf(`${marker}\n`), sensitive: false },
      });
      expect(mine.find((fact) => fact.kind === 'file.written')?.details).toMatchObject({
        hashBefore: etagOf(`${marker}\n`),
        hashAfter: etagOf(`${marker}!\n`),
        sizeBytes: marker.length + 2,
      });
      expect(mine.find((fact) => fact.kind === 'file.moved')?.details).toMatchObject({
        from: 'b.ts',
        to: 'c.ts',
      });
      expect(JSON.stringify(mine)).not.toContain(marker);
    });

    it('writes nothing when the trail cannot take the fact — S-117', async () => {
      await writeFile(at('a.ts'), 'one\n');
      trail.failure = new Error('the database is gone');

      const saved = await save('a.ts', 'two\n', etagOf('one\n'));
      const created = await create({ path: 'b.ts', kind: 'file' });

      for (const response of [saved, created]) {
        expect(response.status).toBe(503);
        expect(response.headers['retry-after']).toBe('5');
        expect(response.body.error).toMatchObject({
          code: 'SERVICE_UNAVAILABLE',
          params: { retryAfterSeconds: 5 },
        });
      }

      expect(await readFile(at('a.ts'), 'utf8')).toBe('one\n');
      expect(await readdir(folder)).toEqual(['a.ts']);
    });

    it('points a file.failed at the fact whose write the disk refused — S-118', async () => {
      await writeFile(at('locked.ts'), 'one\n');
      await chmod(at('locked.ts'), 0o444);

      expect((await save('locked.ts', 'two\n', etagOf('one\n'))).status).toBe(422);

      const [written, failed] = await factsAbout('locked.ts');

      expect(written?.kind).toBe('file.written');
      expect(failed).toMatchObject({
        kind: 'file.failed',
        details: { failedEventId: written?.id, kind: 'file.written', code: 'FILE_ACCESS_DENIED' },
      });
    });
  });
});
