import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';

import { AUDIT_EVENT_REPOSITORY } from '@application/audit';
import { FILE_HISTORY_STORE } from '@application/files';
import type { FileHistoryStore } from '@application/files';
import { DrizzleAuditEventRepository } from '@adapter/outbound/persistence/audit/drizzle-audit-event.repository';
import { DrizzleFileHistoryStore } from '@adapter/outbound/persistence/files/drizzle-file-history.store';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { FileHistoryPurgeJob } from '@infra/jobs/file-history-purge.job';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { SwitchableAuditEvents } from '../../../../support/fakes/switchable-audit-events';
import { SwitchableFileHistory } from '../../../../support/fakes/switchable-file-history';

const OTHER = 'auth|other';

function etagOf(content: string | Buffer): string {
  return `"${createHash('sha256').update(content).digest('hex')}"`;
}

/** One entry of the history, as `GET /files/history` answers it. */
interface EntryBody {
  readonly id: string;
  readonly path: string;
  readonly entryKind: 'file' | 'directory';
  readonly reason: string;
  readonly kept: string;
  readonly sizeBytes: number | null;
  readonly hash: string | null;
  readonly author: { readonly self: boolean; readonly id: string };
  readonly at: string;
  readonly batchId: string | null;
}

/**
 * The local history through the real application — plan 07, B-57 and B-58.
 *
 * Saving keeps the version it replaces; deleting with `keepInHistory` keeps what goes and answers
 * the batch for an undo, or deletes nothing; restoring is an ordinary write — `If-Match` replaces,
 * none re-creates — in the trail before the disk. Each test works in a folder of its own.
 */
describe('the files HTTP surface — the local history', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let trail: SwitchableAuditEvents;
  let history: SwitchableFileHistory;
  let token: string;
  let otherToken: string;
  let root: string;
  let folder: string;
  let counter = 0;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    const allowlist = writeTestAllowlist([SUBJECT, OTHER]);
    root = allowlist.root;

    harness = await startTestApp(
      database.url,
      identity,
      (builder) =>
        builder
          .overrideProvider(AUDIT_EVENT_REPOSITORY)
          .useFactory({
            inject: [PERSISTENCE_CONTEXT],
            factory: (context: PersistenceContext) =>
              new SwitchableAuditEvents(new DrizzleAuditEventRepository(context)),
          })
          .overrideProvider(FILE_HISTORY_STORE)
          .useFactory({
            inject: [DrizzleFileHistoryStore],
            factory: (store: FileHistoryStore) => new SwitchableFileHistory(store),
          }),
      allowlist,
    );
    trail = harness.app.get(AUDIT_EVENT_REPOSITORY);
    history = harness.app.get(FILE_HISTORY_STORE);
    token = await identity.accessToken({ subject: SUBJECT });
    otherToken = await identity.accessToken({ subject: OTHER });
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
    history.failure = null;
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());
  const authed = <T extends request.Test>(test: T, as = token): T =>
    test.set('authorization', `Bearer ${as}`) as T;
  const at = (...segments: string[]): string => path.join(folder, ...segments);

  const save = (relative: string, content: string, ifMatch: string, as = token): request.Test =>
    authed(http().put('/files/content'), as)
      .send({ folder, path: relative, content })
      .set('if-match', ifMatch);

  const remove = (relative: string, extra: Record<string, string> = {}): request.Test =>
    authed(
      http().delete(
        `/files?${new URLSearchParams({ folder, path: relative, keepInHistory: 'true', ...extra }).toString()}`,
      ),
    );

  const list = (query: Record<string, string> = {}, inFolder = folder): request.Test =>
    authed(
      http().get(
        `/files/history?${new URLSearchParams({ folder: inFolder, ...query }).toString()}`,
      ),
    );

  const content = (entryId: string, inFolder = folder, extra: Record<string, string> = {}) =>
    authed(
      http().get(
        `/files/history/${entryId}/content?${new URLSearchParams({ folder: inFolder, ...extra }).toString()}`,
      ),
    );

  const restore = (
    entryId: string,
    ifMatch: string | null = null,
    body: Record<string, unknown> = {},
  ): request.Test => {
    const test = authed(http().post(`/files/history/${entryId}/restore`)).send({ folder, ...body });

    return ifMatch === null ? test : test.set('if-match', ifMatch);
  };

  const versionsOf = async (relative: string): Promise<EntryBody[]> =>
    (await list({ path: relative })).body.entries as EntryBody[];

  /** The kinds of the file facts about this test's folder, oldest first. */
  const kinds = async (): Promise<string[]> =>
    (
      (await authed(http().get('/audit-events?kind=file.&limit=100'))).body.events as {
        kind: string;
        subjectId: string;
      }[]
    )
      .filter((fact) => fact.subjectId.startsWith(`${folder}/`))
      .map((fact) => fact.kind)
      .reverse();

  /** Saves `a.txt` from `one` to `two`, and answers the entry that kept `one`. */
  async function savedTwice(): Promise<EntryBody> {
    await writeFile(at('a.txt'), 'one\n');
    expect((await save('a.txt', 'two\n', etagOf('one\n'))).status).toBe(200);

    const [entry] = await versionsOf('a.txt');
    return entry!;
  }

  describe('keeping before a save — B-57', () => {
    it('keeps the previous version: metadata in the table, the bytes in a blob — S-329', async () => {
      await writeFile(at('a.txt'), 'one\n');

      const response = await save('a.txt', 'two\n', etagOf('one\n'));
      const [entry] = await versionsOf('a.txt');
      const blob = path.join(
        String(process.env['RC_FILES_HISTORY_DIR']),
        etagOf('one\n').slice(1, 3),
        etagOf('one\n').slice(1, -1),
      );

      expect(response.body.history).toEqual({ kept: true, entryId: entry?.id });
      expect(entry).toMatchObject({
        path: 'a.txt',
        entryKind: 'file',
        reason: 'save',
        kept: 'yes',
        sizeBytes: 4,
        hash: etagOf('one\n'),
        author: { self: true, id: SUBJECT },
        batchId: null,
      });
      expect(await readFile(blob, 'utf8')).toBe('one\n');
      expect((await content(entry!.id)).body).toMatchObject({
        content: 'one\n',
        etag: etagOf('one\n'),
      });
    });

    it('keeps nothing of a retry the disk already holds', async () => {
      await savedTwice();

      const retry = await save('a.txt', 'two\n', etagOf('one\n'));

      expect(retry.body.history).toBeNull();
      expect(await versionsOf('a.txt')).toHaveLength(1);
    });

    it('saves when the history fails: warn in the log, and the answer says so — S-336', async () => {
      await writeFile(at('a.txt'), 'one\n');
      history.failure = new Error('the history store is down');

      const response = await save('a.txt', 'two\n', etagOf('one\n'));

      expect(response.status).toBe(200);
      expect(response.body.history).toEqual({ kept: false, reason: 'unavailable' });
      expect(await readFile(at('a.txt'), 'utf8')).toBe('two\n');
      expect(harness.log.withOp('files.history').at(-1)).toMatchObject({
        level: 'warn',
        path: 'a.txt',
      });
    });

    it('keeps metadata only of a version past the snapshot ceiling — S-333', async () => {
      const big = 'x'.repeat(70_000);
      await writeFile(at('big.txt'), big);

      const response = await save('big.txt', 'small\n', etagOf(big));
      const [entry] = await versionsOf('big.txt');

      expect(response.body.history).toEqual({ kept: false, reason: 'tooLarge' });
      expect(entry).toMatchObject({ kept: 'tooLarge', sizeBytes: 70_000, hash: etagOf(big) });
      expect((await content(entry!.id)).status).toBe(404);
    });
  });

  describe('keeping before an upload replaces — B-57', () => {
    const replacing = (content: string, ifMatch: string): request.Test =>
      authed(http().post('/files/upload'))
        .field('folder', folder)
        .field(
          'manifest',
          JSON.stringify([
            { path: 'a.txt', size: Buffer.byteLength(content), onConflict: 'replace', ifMatch },
          ]),
        )
        .attach('file', Buffer.from(content), 'a.txt');

    it('keeps the version an upload replaces, reason upload — S-335', async () => {
      await writeFile(at('a.txt'), 'before\n');

      const response = await replacing('after\n', etagOf('before\n'));
      const [entry] = await versionsOf('a.txt');

      expect(response.status).toBe(200);
      expect(response.body.items).toEqual([
        {
          path: 'a.txt',
          status: 'replaced',
          etag: etagOf('after\n'),
          history: { kept: true, entryId: entry?.id },
        },
      ]);
      expect(entry).toMatchObject({ reason: 'upload', hash: etagOf('before\n') });
      expect((await content(entry!.id)).body.content).toBe('before\n');
      expect(await readFile(at('a.txt'), 'utf8')).toBe('after\n');
    });

    it('replaces when the history fails, and the item says that version was not kept', async () => {
      await writeFile(at('a.txt'), 'before\n');
      history.failure = new Error('the history store is down');

      const response = await replacing('after\n', etagOf('before\n'));

      expect(response.body.items[0]).toMatchObject({
        status: 'replaced',
        history: { kept: false, reason: 'unavailable' },
      });
      expect(await readFile(at('a.txt'), 'utf8')).toBe('after\n');
      expect(harness.log.withOp('files.history').at(-1)).toMatchObject({ level: 'warn' });
    });
  });

  describe('deleting with keepInHistory — B-57', () => {
    it('keeps a file, deletes it, and answers the batch for the undo — S-335', async () => {
      await writeFile(at('a.txt'), 'gone\n');

      const response = await remove('a.txt');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        kept: {
          batchId: expect.any(String),
          entries: [{ id: expect.any(String), path: 'a.txt', entryKind: 'file' }],
        },
      });
      await expect(stat(at('a.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await kinds()).toEqual(['file.deleted']);
    });

    it('a whole folder comes back from its batch, empty folders too — S-344', async () => {
      await mkdir(at('src', 'lib'), { recursive: true });
      await mkdir(at('src', 'empty'));
      await writeFile(at('src', 'a.txt'), 'a\n');
      await writeFile(at('src', 'lib', 'b.txt'), 'b\n');

      const deleted = await remove('src');
      const entries = deleted.body.kept.entries as { id: string; path: string }[];

      expect(deleted.status).toBe(200);
      expect(entries.map((entry) => entry.path).sort()).toEqual([
        'src',
        'src/a.txt',
        'src/empty',
        'src/lib',
        'src/lib/b.txt',
      ]);
      await expect(stat(at('src'))).rejects.toMatchObject({ code: 'ENOENT' });
      expect(
        ((await list({ reason: 'delete' })).body.entries as EntryBody[]).find(
          (entry) => entry.path === 'src/empty',
        ),
      ).toMatchObject({ entryKind: 'directory', hash: null, sizeBytes: null });

      for (const entry of entries) {
        expect((await restore(entry.id)).status).toBe(200);
      }

      expect(await readFile(at('src', 'a.txt'), 'utf8')).toBe('a\n');
      expect(await readFile(at('src', 'lib', 'b.txt'), 'utf8')).toBe('b\n');
      expect(await readdir(at('src', 'empty'))).toEqual([]);
    });

    it('lists what was deleted and is not back, and stops listing it once it is', async () => {
      await writeFile(at('a.txt'), 'a\n');
      await writeFile(at('b.txt'), 'b\n');
      const [first, second] = [await remove('a.txt'), await remove('b.txt')];

      const deleted = await list({ deleted: 'true' });
      expect((deleted.body.entries as EntryBody[]).map((entry) => entry.path)).toEqual([
        'b.txt',
        'a.txt',
      ]);

      await restore(String(first.body.kept.entries[0].id));
      const after = await list({ deleted: 'true', limit: '1' });

      expect((after.body.entries as EntryBody[]).map((entry) => entry.id)).toEqual([
        second.body.kept.entries[0].id,
      ]);
      expect(after.body.nextCursor).toBeNull();
    });

    it('deletes nothing when the history fails, and sends the client to the definitive step — S-337', async () => {
      await writeFile(at('a.txt'), 'stays\n');
      await mkdir(at('src'));
      await writeFile(at('src', 'b.txt'), 'stays\n');
      history.failure = new Error('the history store is down');

      const file = await remove('a.txt');
      const directory = await remove('src');

      expect(file.status).toBe(428);
      expect(file.body.error).toMatchObject({
        code: 'PRECONDITION_REQUIRED',
        params: { reason: 'notKept', why: 'unavailable' },
      });
      expect(directory.status).toBe(409);
      expect(directory.body.error).toMatchObject({
        code: 'DIRECTORY_NOT_EMPTY',
        params: { entryCount: 1, entryCountCapped: false, notKept: 'unavailable' },
      });
      expect(await readFile(at('a.txt'), 'utf8')).toBe('stays\n');
      expect(await readFile(at('src', 'b.txt'), 'utf8')).toBe('stays\n');

      // The definitive step of D-06 still works exactly as it did.
      const definitive = await authed(
        http().delete(
          `/files?${new URLSearchParams({ folder, path: 'src', recursive: 'true', expectedEntries: '1' }).toString()}`,
        ),
      );
      expect(definitive.status).toBe(204);
    });

    it('deletes nothing of a file past the snapshot ceiling, or of a folder too big to keep', async () => {
      await writeFile(at('big.txt'), 'x'.repeat(70_000));
      await mkdir(at('many'));
      await Promise.all(
        Array.from({ length: 1_000 }, (_, index) => writeFile(at('many', `f${String(index)}`), '')),
      );

      const big = await remove('big.txt');
      const many = await remove('many');

      expect(big.status).toBe(428);
      expect(big.body.error.params).toMatchObject({ reason: 'notKept', why: 'tooLarge' });
      expect(many.status).toBe(409);
      expect(many.body.error.params).toMatchObject({ entryCount: 1_000, notKept: 'tooMany' });
      expect((await readdir(at('many'))).length).toBe(1_000);
      expect(await kinds()).toEqual([]);
    });
  });

  describe('restoring — B-58', () => {
    it('with the If-Match of the current file, writes it and keeps the current one — S-338', async () => {
      const kept = await savedTwice();

      const response = await restore(kept.id, etagOf('two\n'));
      const [newest] = await versionsOf('a.txt');

      expect(response.status).toBe(200);
      expect(response.headers['etag']).toBe(etagOf('one\n'));
      expect(response.body).toEqual({
        path: 'a.txt',
        etag: etagOf('one\n'),
        size: 4,
        written: true,
        history: { kept: true, entryId: newest?.id },
      });
      expect(newest).toMatchObject({ reason: 'restore', hash: etagOf('two\n') });
      expect(await readFile(at('a.txt'), 'utf8')).toBe('one\n');
      expect(await kinds()).toEqual(['file.written', 'file.restored']);
    });

    it('refuses when the current file changed — Claude wrote — and writes nothing — S-339', async () => {
      const kept = await savedTwice();
      await writeFile(at('a.txt'), 'written by Claude\n');

      const response = await restore(kept.id, etagOf('two\n'));

      expect(response.status).toBe(412);
      expect(response.headers['etag']).toBe(etagOf('written by Claude\n'));
      expect(response.body.error).toMatchObject({ code: 'FILE_CHANGED' });
      expect(await readFile(at('a.txt'), 'utf8')).toBe('written by Claude\n');
    });

    it('re-creates a deleted file, with the folders above it; a taken path is 409 — S-340', async () => {
      await mkdir(at('deep', 'er'), { recursive: true });
      await writeFile(at('deep', 'er', 'x.txt'), 'x\n');
      const deleted = await remove('deep');
      const file = (deleted.body.kept.entries as { id: string; path: string }[]).find(
        (entry) => entry.path === 'deep/er/x.txt',
      );

      const restored = await restore(file!.id);

      expect(restored.status).toBe(200);
      expect(restored.body).toMatchObject({ path: 'deep/er/x.txt', written: true, history: null });
      expect(await readFile(at('deep', 'er', 'x.txt'), 'utf8')).toBe('x\n');

      await writeFile(at('deep', 'er', 'x.txt'), 'someone else\n');
      const taken = await restore(file!.id);

      expect(taken.status).toBe(409);
      expect(taken.body.error).toMatchObject({
        code: 'FILE_EXISTS',
        params: { currentEtag: etagOf('someone else\n') },
      });
    });

    it('answers 404 for an entry that is not there, or outside the folder asked — S-341', async () => {
      const kept = await savedTwice();
      const elsewhere = path.join(root, `elsewhere-${String(counter)}`);
      await mkdir(elsewhere);

      for (const response of [
        await content('01J0NOTANENTRY0000000000000'),
        await restore('01J0NOTANENTRY0000000000000'),
        await content(kept.id, elsewhere),
        await authed(http().post(`/files/history/${kept.id}/restore`)).send({ folder: elsewhere }),
      ]) {
        expect(response.status).toBe(404);
        expect(response.body.error).toMatchObject({
          code: 'HISTORY_ENTRY_NOT_FOUND',
          messageKey: 'files.error.historyEntryNotFound',
        });
      }

      expect((await list({}, elsewhere)).body.entries).toEqual([]);
      expect((await content('not-an-id!')).status).toBe(400);
    });

    it('restoring the same entry twice writes once — S-342', async () => {
      await writeFile(at('a.txt'), 'a\n');
      const deleted = await remove('a.txt');
      const entryId = String(deleted.body.kept.entries[0].id);

      const first = await restore(entryId);
      const second = await restore(entryId);

      expect(first.body.written).toBe(true);
      expect(second.status).toBe(200);
      expect(second.body).toMatchObject({ written: false, etag: etagOf('a\n') });
      expect(await kinds()).toEqual(['file.deleted', 'file.restored']);
    });

    it('records file.restored before the disk: a trail that is down writes nothing — S-343', async () => {
      await writeFile(at('a.txt'), 'a\n');
      const deleted = await remove('a.txt');
      trail.failure = new Error('database down');

      const response = await restore(String(deleted.body.kept.entries[0].id));

      expect(response.status).toBe(503);
      expect(response.headers['retry-after']).toBeDefined();
      await expect(stat(at('a.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('asks the second step of a file that changes what Claude may do', async () => {
      await writeFile(at('.mcp.json'), '{}\n');
      const deleted = await remove('.mcp.json', { confirmSensitive: 'true' });
      const entryId = String(deleted.body.kept.entries[0].id);

      expect((await restore(entryId)).status).toBe(428);
      expect((await restore(entryId, null, { confirmSensitive: true })).status).toBe(200);
    });
  });

  describe('reading the history — B-58', () => {
    it('shows a version written by another person of the same root, with its author — S-350', async () => {
      await writeFile(at('shared.txt'), 'mine\n');
      expect((await save('shared.txt', 'theirs\n', etagOf('mine\n'), otherToken)).status).toBe(200);

      const [entry] = await versionsOf('shared.txt');

      expect(entry?.author).toEqual({ self: false, id: OTHER });
    });

    it('pages newest first, filters by reason, and covers the whole folder without a path', async () => {
      await writeFile(at('a.txt'), '1\n');
      for (const [from, to] of [
        ['1\n', '2\n'],
        ['2\n', '3\n'],
        ['3\n', '4\n'],
      ] as const) {
        await save('a.txt', to, etagOf(from));
      }
      await writeFile(at('b.txt'), 'b\n');
      await remove('b.txt');

      const first = await list({ path: 'a.txt', limit: '2' });
      const second = await list({
        path: 'a.txt',
        limit: '2',
        cursor: String(first.body.nextCursor),
      });

      expect((first.body.entries as EntryBody[]).map((entry) => entry.hash)).toEqual([
        etagOf('3\n'),
        etagOf('2\n'),
      ]);
      expect((second.body.entries as EntryBody[]).map((entry) => entry.hash)).toEqual([
        etagOf('1\n'),
      ]);
      expect(second.body.nextCursor).toBeNull();
      expect((await list({ reason: 'delete' })).body.entries).toHaveLength(1);
      expect((await list()).body.entries).toHaveLength(4);
      expect((await list({ cursor: 'abc' })).status).toBe(400);
      expect((await list({ reason: 'move' })).status).toBe(400);
    });

    it('answers a folder entry 422 and a binary version 415, and reopens with an encoding', async () => {
      await mkdir(at('dir'));
      const folderEntry = (await remove('dir')).body.kept.entries[0].id as string;
      await writeFile(at('bin'), Buffer.from([0, 1, 2, 0]));
      const binEntry = (await remove('bin')).body.kept.entries[0].id as string;
      await writeFile(at('latin.txt'), Buffer.from([0x63, 0x61, 0x66, 0xe9]));
      const latinEntry = (await remove('latin.txt')).body.kept.entries[0].id as string;

      expect((await content(folderEntry)).status).toBe(422);
      expect((await content(binEntry)).status).toBe(415);
      expect((await content(latinEntry, folder, { encoding: 'latin1' })).body).toMatchObject({
        content: 'café',
        encoding: 'latin1',
      });
    });

    it('is purged by the job the module runs', async () => {
      await expect(harness.app.get(FileHistoryPurgeJob).purgeNow()).resolves.toMatchObject({
        aged: 0,
      });
    });
  });
});
