import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';

import type { VersionToKeep } from '@application/files';
import { HistoryBlobDirectory } from '@adapter/outbound/filesystem/history-blob.directory';
import { DrizzleFileHistoryStore } from '@adapter/outbound/persistence/files/drizzle-file-history.store';
import { UserId } from '@domain/auth';
import { Etag, FileTooLargeError } from '@domain/files';
import type { HistoryReason } from '@domain/files';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { migrate } from '@infra/database/migrator';
import { FileHistoryPurgeJob } from '@infra/jobs/file-history-purge.job';
import { waitFor } from '../../../../../support/app/wait-for';
import { startPostgres } from '../../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../../support/containers/postgres';
import { FixedClock } from '../../../../../support/fakes/fixed-clock';
import { ManualScheduler } from '../../../../../support/fakes/manual-scheduler';
import { aPersistenceContext } from '../../../../../support/fakes/persistence-context';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';
import { SequentialIds } from '../../../../../support/fakes/sequential-ids';

const owner = UserId.create('auth|owner');
const now = new Date('2026-10-01T12:00:00.000Z');
const DAY = 86_400_000;

/** The limits of the store under test — small, so every ceiling is crossed with a few bytes. */
const LIMITS = { maxPerFile: 3, maxStoreBytes: 1_000, retentionDays: 30 };

/**
 * The local history against a real PostgreSQL and a real disk — plan 07, B-56: metadata in the
 * table, contents in blobs named by their hash, and every ceiling kept without ever deleting a blob
 * another entry still names.
 */
describe('DrizzleFileHistoryStore', () => {
  let database: DisposablePostgres;
  let connection: DatabaseConnection;
  let root: string;
  let clock: FixedClock;
  const ids = new SequentialIds('01J2000000000000000000');

  beforeAll(async () => {
    database = await startPostgres();
    connection = openDatabase(database.url);
    await migrate(connection.pool);
  });

  afterAll(async () => {
    await connection.pool.end();
    await database.stop();
  });

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'rc-history-store-'));
    clock = new FixedClock(now);
  });

  afterEach(async () => {
    await connection.db.execute(sql`TRUNCATE TABLE "file_history_entries"`);
    await rm(root, { recursive: true, force: true });
  });

  const build = (limits = LIMITS) =>
    new DrizzleFileHistoryStore(
      aPersistenceContext(connection.db, { clock }),
      new HistoryBlobDirectory(root, new RecordingLogger().logger),
      limits,
    );

  function version(
    filePath: string,
    content: string | null,
    overrides: Partial<VersionToKeep> & { reason?: HistoryReason } = {},
  ): VersionToKeep {
    const reason = overrides.reason ?? 'save';

    return {
      id: ids.next(),
      userId: owner,
      path: filePath,
      label: path.basename(filePath),
      reason,
      batchId: reason === 'delete' ? 'BATCH' : null,
      createdAt: now,
      contents:
        content === null
          ? { kind: 'directory' }
          : { kind: 'file', read: () => Promise.resolve(Buffer.from(content)) },
      ...overrides,
    };
  }

  const blobFiles = async (): Promise<string[]> => {
    const shards = await readdir(root).catch(() => []);
    const names = await Promise.all(shards.map((shard) => readdir(path.join(root, shard))));

    return names.flat().sort();
  };

  const count = async (): Promise<number> =>
    (await connection.db.execute(sql`SELECT count(*)::int AS n FROM "file_history_entries"`))
      .rows[0]?.['n'] as number;

  it('keeps the metadata in the table and the contents in a blob, never in Postgres — S-329', async () => {
    const [entry] = await build().keep([version('/srv/app/a.ts', 'one\n')]);
    const columns = await connection.db.execute(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'file_history_entries' ORDER BY column_name`,
    );

    expect(entry).toMatchObject({
      path: '/srv/app/a.ts',
      label: 'a.ts',
      entryKind: 'file',
      hash: Etag.of(Buffer.from('one\n')).digest,
      sizeBytes: 4,
      reason: 'save',
      kept: 'yes',
      createdAt: now,
    });
    expect(columns.rows.map((row) => row['column_name'])).toEqual([
      'batch_id',
      'created_at',
      'entry_kind',
      'hash',
      'id',
      'kept',
      'label',
      'path',
      'reason',
      'seq',
      'size_bytes',
      'user_id',
    ]);
    expect(await blobFiles()).toEqual([entry?.hash]);
    expect(Buffer.from((await build().contents(entry!)) ?? []).toString()).toBe('one\n');
  });

  it('keeps the same contents twice as one blob — S-330', async () => {
    const store = build();
    await store.keep([version('/srv/app/a.ts', 'same')]);
    await store.keep([version('/srv/app/b.ts', 'same')]);

    expect(await count()).toBe(2);
    expect(await blobFiles()).toEqual([Etag.of(Buffer.from('same')).digest]);
  });

  it('keeps a version past the ceiling as metadata only, saying why — S-333', async () => {
    const [entry] = await build().keep([
      {
        ...version('/srv/app/big.bin', null),
        contents: { kind: 'tooLarge', hash: 'c'.repeat(64), sizeBytes: 9 },
      },
    ]);

    expect(entry).toMatchObject({ kept: 'tooLarge', hash: 'c'.repeat(64), sizeBytes: 9 });
    expect(await build().contents(entry!)).toBeNull();
    expect(await blobFiles()).toEqual([]);
  });

  it('keeps a folder of a delete without a blob', async () => {
    const [entry] = await build().keep([version('/srv/app/src', null, { reason: 'delete' })]);

    expect(entry).toMatchObject({
      entryKind: 'directory',
      hash: null,
      sizeBytes: null,
      batchId: 'BATCH',
    });
    expect(await build().contents(entry!)).toBeNull();
  });

  it('keeps all of a batch or none of it', async () => {
    await expect(
      build().keep([
        version('/srv/app/a.ts', 'first'),
        {
          ...version('/srv/app/b.ts', null),
          contents: {
            kind: 'file',
            read: () => Promise.reject(new FileTooLargeError('b.ts', 9, 4, 'bytes')),
          },
        },
      ]),
    ).rejects.toBeInstanceOf(FileTooLargeError);
    expect(await count()).toBe(0);

    // The blob written before the failure is named by nothing, and the next sweep removes it.
    expect(await blobFiles()).toHaveLength(1);
    expect((await build().purge()).swept).toBe(1);
    expect(await blobFiles()).toEqual([]);
  });

  it('keeps nothing of nothing', async () => {
    await expect(build().keep([])).resolves.toEqual([]);
  });

  it('trims the versions of a path past the ceiling, the oldest first, as it keeps — S-331', async () => {
    const store = build();

    for (const content of ['v1', 'v2', 'v3', 'v4', 'v5']) {
      await store.keep([version('/srv/app/a.ts', content)]);
    }
    await store.keep([version('/srv/app/b.ts', 'v1')]);

    const versions = await store.page({
      scope: { kind: 'path', path: '/srv/app/a.ts' },
      reason: null,
      before: null,
      limit: 10,
    });

    expect(versions.map((entry) => entry.sizeBytes)).toEqual([2, 2, 2]);
    expect(
      await Promise.all(
        versions.map(async (entry) => Buffer.from((await store.contents(entry)) ?? []).toString()),
      ),
    ).toEqual(['v5', 'v4', 'v3']);

    // `v1` is still named by `b.ts`, `v2` by nobody: the sweep takes only `v2`.
    expect((await store.purge()).swept).toBe(1);
    expect(await blobFiles()).toHaveLength(4);
  });

  it('purges the total by the oldest entries, never a blob another entry still names — S-331', async () => {
    const store = build({ ...LIMITS, maxStoreBytes: 10 });
    const shared = 'shared'; // 6 bytes, kept first under one path and again, last, under another
    await store.keep([version('/srv/app/a.ts', shared)]);
    await store.keep([version('/srv/app/b.ts', 'four')]);
    await store.keep([version('/srv/app/c.ts', 'five5')]);
    await store.keep([version('/srv/app/d.ts', shared)]);

    // 6 + 4 + 5 = 15 distinct bytes, 10 allowed. The oldest entry (`a.ts`) frees nothing — `d.ts`
    // still names its blob —, `b.ts` frees 4: 11 left; `c.ts` frees 5: 6 left, within.
    const purge = await store.purge();
    const left = await store.page({
      scope: { kind: 'under', folder: '/srv/app' },
      reason: null,
      before: null,
      limit: 10,
    });

    expect(purge).toMatchObject({ overCeiling: 3, swept: 2 });
    expect(left.map((entry) => entry.label)).toEqual(['d.ts']);
    expect(Buffer.from((await store.contents(left[0]!)) ?? []).toString()).toBe(shared);
  });

  it('purges what passed the retention, and nothing younger — S-332', async () => {
    const store = build();
    await store.keep([
      version('/srv/app/old.ts', 'old', { createdAt: new Date(now.getTime() - 31 * DAY) }),
      version('/srv/app/edge.ts', 'edge', { createdAt: new Date(now.getTime() - 30 * DAY) }),
      version('/srv/app/new.ts', 'new'),
    ]);

    expect(await store.purge()).toMatchObject({ aged: 1, swept: 1 });
    expect(
      (
        await store.page({
          scope: { kind: 'under', folder: '/srv/app' },
          reason: null,
          before: null,
          limit: 10,
        })
      )
        .map((entry) => entry.label)
        .sort(),
    ).toEqual(['edge.ts', 'new.ts']);

    clock.advance(DAY + 1);
    expect(await store.purge()).toMatchObject({ aged: 1 });
  });

  it('two purges at once — the job and a direct call — neither lose nor duplicate — S-334', async () => {
    const store = build({ ...LIMITS, maxStoreBytes: 4 });
    for (const [file, content] of [
      ['a', 'aaaa'],
      ['b', 'bbbb'],
      ['c', 'cccc'],
    ] as const) {
      await store.keep([version(`/srv/app/${file}.ts`, content)]);
    }
    await store.keep([version('/srv/app/old.ts', 'old', { createdAt: new Date(0) })]);

    const job = new FileHistoryPurgeJob(store, new ManualScheduler(), new RecordingLogger().logger);
    const [first, second] = await Promise.all([job.purgeNow(), store.purge()]);
    const total = (key: keyof typeof first) => first[key] + second[key];

    expect(total('aged')).toBe(1);
    expect(total('overCeiling')).toBe(2);
    expect(total('swept')).toBe(3);
    expect(await count()).toBe(1);
    // What is left still has its blob, and nothing else does.
    const [left] = await store.page({
      scope: { kind: 'under', folder: '/srv/app' },
      reason: null,
      before: null,
      limit: 10,
    });
    expect(await blobFiles()).toEqual([left?.hash]);
  });

  it('a keeping waits for a purge that holds the lock — the sweep never sees it halfway', async () => {
    const client = await connection.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('["file_history_entries"]'))`);

      const keeping = build().keep([version('/srv/app/a.ts', 'waits')]);
      await waitFor(
        'the keeping waiting on the lock',
        async () =>
          (
            await connection.pool.query(
              `SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`,
            )
          ).rows[0] as { n: number },
        (row) => row.n === 1,
      );

      expect(await count()).toBe(0);
      await client.query('COMMIT');
      await expect(keeping).resolves.toHaveLength(1);
    } finally {
      client.release();
    }
  });

  it('finds an entry by id, forgets a batch, and reads nothing of a blob that is gone', async () => {
    const store = build();
    const [kept] = await store.keep([
      version('/srv/app/a.ts', 'x', { reason: 'delete', batchId: 'B1' }),
    ]);

    expect(await store.find(kept!.id)).toEqual(kept);
    expect(await store.find('NOPE')).toBeNull();

    await rm(root, { recursive: true, force: true });
    expect(await store.contents(kept!)).toBeNull();

    await store.discard('B1');
    expect(await store.find(kept!.id)).toBeNull();
  });

  it('pages one path or a folder, by reason, below a cursor — never a sibling with a longer name', async () => {
    const store = build({ ...LIMITS, maxPerFile: 50 });
    await store.keep([version('/srv/app/a.ts', '1')]);
    await store.keep([version('/srv/app/a.ts', '2', { reason: 'restore' })]);
    await store.keep([version('/srv/app/sub/b.ts', '3')]);
    await store.keep([version('/srv/apple/c.ts', '4')]);
    await store.keep([version('/srv/a_b/d.ts', '5')]);
    await store.keep([version('/srv/axb/e.ts', '6')]);
    await store.keep([version('/srv/100%/f.ts', '7')]);
    await store.keep([version('/srv/1000/g.ts', '8')]);

    const under = (folder: string) =>
      store.page({ scope: { kind: 'under', folder }, reason: null, before: null, limit: 10 });

    expect((await under('/srv/app')).map((entry) => entry.label)).toEqual(['b.ts', 'a.ts', 'a.ts']);
    expect((await under('/srv/app/')).map((entry) => entry.label)).toEqual([
      'b.ts',
      'a.ts',
      'a.ts',
    ]);
    expect((await under('/srv/a_b')).map((entry) => entry.label)).toEqual(['d.ts']);
    expect((await under('/srv/100%')).map((entry) => entry.label)).toEqual(['f.ts']);

    const restores = await store.page({
      scope: { kind: 'path', path: '/srv/app/a.ts' },
      reason: 'restore',
      before: null,
      limit: 10,
    });
    expect(restores.map((entry) => entry.reason)).toEqual(['restore']);

    const [newest] = await store.page({
      scope: { kind: 'path', path: '/srv/app/a.ts' },
      reason: null,
      before: null,
      limit: 1,
    });
    const older = await store.page({
      scope: { kind: 'path', path: '/srv/app/a.ts' },
      reason: null,
      before: newest!.seq,
      limit: 10,
    });
    expect(older.map((entry) => entry.reason)).toEqual(['save']);
  });

  it('names the latest delete of each path under a folder, newest first, below a cursor', async () => {
    const store = build({ ...LIMITS, maxPerFile: 50 });
    await store.keep([version('/srv/app/a.ts', '1', { reason: 'delete' })]);
    await store.keep([version('/srv/app/b.ts', '2', { reason: 'delete' })]);
    await store.keep([version('/srv/app/a.ts', '3', { reason: 'delete' })]);
    await store.keep([version('/srv/app/c.ts', '4')]);
    await store.keep([version('/srv/other/d.ts', '5', { reason: 'delete' })]);

    const latest = await store.latestDeletes('/srv/app', null, 10);

    expect(latest.map((entry) => [entry.label, entry.sizeBytes])).toEqual([
      ['a.ts', 1],
      ['b.ts', 1],
    ]);
    expect(Buffer.from((await store.contents(latest[0]!)) ?? []).toString()).toBe('3');
    expect(
      (await store.latestDeletes('/srv/app', latest[0]!.seq, 10)).map((entry) => entry.label),
    ).toEqual(['b.ts']);
  });
});
