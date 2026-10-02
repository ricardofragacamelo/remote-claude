import { describe, expect, it } from 'vitest';

import type { FolderDisk, KeptBatch } from '@application/files';
import { UserId } from '@domain/auth';
import { Etag, FilePath, FileTooLargeError } from '@domain/files';
import type { TreeChild } from '@domain/files';
import { WorkspacePath } from '@domain/workspace';
import { aHistoryKeeper, InMemoryFileHistory } from '../../../support/fakes/in-memory-file-history';
import { stubFolderDisk } from '../../../support/fakes/stub-folder-disk';

const owner = UserId.create('auth|42');
const folder = WorkspacePath.create('/srv/app');
const at = (relative: string): FilePath => FilePath.create(folder, relative);
const mtime = new Date('2026-10-01T10:00:00.000Z');

/** A child of a listing. */
function child(name: string, kind: TreeChild['kind'], size = 4, extra: Partial<TreeChild> = {}) {
  return { name, kind, size, mtime, unreadableName: false, target: null, ...extra };
}

/** A disk holding a tree of folders, each with its children; every file holds its own path. */
function treeDisk(
  tree: Record<string, TreeChild[]>,
  overrides: Partial<FolderDisk> = {},
): FolderDisk {
  return stubFolderDisk({
    list: (directory, limit) => {
      const children = tree[directory.relative] ?? [];

      return Promise.resolve({
        children: children.slice(0, limit),
        exhausted: children.length <= limit,
      });
    },
    read: (file) => Promise.resolve({ bytes: Buffer.from(file.relative), mtime }),
    inspect: (entry) =>
      Promise.resolve(
        entry.relative in tree
          ? { kind: 'directory', size: 0, identity: '1:1' }
          : { kind: 'file', size: 4, identity: '1:2' },
      ),
    version: (file) => Promise.resolve(Etag.of(Buffer.from(file.relative))),
    ...overrides,
  });
}

const fileFound = { kind: 'file' as const, size: 4, identity: '1:2' };
const folderFound = { kind: 'directory' as const, size: 0, identity: '1:1' };

describe('HistoryKeeper — before a save, a restore, an upload (B-57)', () => {
  const version = (sizeBytes = 4) => ({
    file: at('a.ts'),
    realPath: '/srv/app/a.ts',
    current: Etag.of(Buffer.from('a.ts')),
    sizeBytes,
    reason: 'save' as const,
    userId: owner,
  });

  it('keeps the bytes on disk, and answers the entry — S-329', async () => {
    const store = new InMemoryFileHistory();
    const keeping = await aHistoryKeeper(treeDisk({}), { store }).keepFile(version());

    expect(keeping).toEqual({ kept: true, entryId: store.entries[0]?.id });
    expect(store.entries[0]).toMatchObject({
      path: '/srv/app/a.ts',
      label: 'a.ts',
      reason: 'save',
      kept: 'yes',
      batchId: null,
      hash: Etag.of(Buffer.from('a.ts')).digest,
    });
  });

  it('keeps metadata only past the ceiling, and says why — S-333', async () => {
    const store = new InMemoryFileHistory();
    const keeping = await aHistoryKeeper(treeDisk({}), { store, maxFileBytes: 3 }).keepFile(
      version(),
    );

    expect(keeping).toEqual({ kept: false, reason: 'tooLarge' });
    expect(store.entries[0]).toMatchObject({ kept: 'tooLarge', sizeBytes: 4 });
    expect(store.blobs.size).toBe(0);
  });

  it('says tooLarge when the file grew past the ceiling after it was measured', async () => {
    const store = new InMemoryFileHistory();
    const disk = treeDisk(
      {},
      { read: (file) => Promise.reject(new FileTooLargeError(file.relative, 9, 4, 'bytes')) },
    );

    expect(await aHistoryKeeper(disk, { store }).keepFile(version())).toEqual({
      kept: false,
      reason: 'tooLarge',
    });
    expect(store.entries.map((entry) => entry.kept)).toEqual(['tooLarge']);
  });

  it('never throws: a history that fails is reported, and the write goes on — S-336', async () => {
    const store = new InMemoryFileHistory();
    const failures: { error: unknown; path: string }[] = [];
    store.failure = new Error('disk full');

    expect(await aHistoryKeeper(treeDisk({}), { store, failures }).keepFile(version())).toEqual({
      kept: false,
      reason: 'unavailable',
    });
    expect(failures).toEqual([{ error: store.failure, path: 'a.ts' }]);
  });
});

describe('HistoryKeeper — before a delete (B-57)', () => {
  it('keeps a file under a batch of its own', async () => {
    const store = new InMemoryFileHistory();
    const keeping = await aHistoryKeeper(treeDisk({}), { store }).keepForDelete(
      at('a.ts'),
      '/srv/app/a.ts',
      fileFound,
      owner,
    );

    expect(keeping).toMatchObject({ kept: true, entries: [{ reason: 'delete', label: 'a.ts' }] });
    expect(store.entries[0]?.batchId).toBe((keeping as KeptBatch).batchId);
  });

  it('keeps every file and folder of a folder, each folder before what is in it — S-335', async () => {
    const store = new InMemoryFileHistory();
    const disk = treeDisk({
      src: [child('lib', 'directory'), child('a.ts', 'file')],
      'src/lib': [child('b.ts', 'file'), child('empty', 'directory')],
      'src/lib/empty': [],
    });
    const keeping = await aHistoryKeeper(disk, { store }).keepForDelete(
      at('src'),
      '/real/src',
      folderFound,
      owner,
    );

    expect(keeping.kept).toBe(true);
    expect(store.entries.map((entry) => [entry.label, entry.entryKind, entry.path])).toEqual([
      ['src', 'directory', '/real/src'],
      ['src/lib', 'directory', '/real/src/lib'],
      ['src/a.ts', 'file', '/real/src/a.ts'],
      ['src/lib/b.ts', 'file', '/real/src/lib/b.ts'],
      ['src/lib/empty', 'directory', '/real/src/lib/empty'],
    ]);
    expect(new Set(store.entries.map((entry) => entry.batchId)).size).toBe(1);
  });

  it.each([
    [
      'too many entries for one delete',
      { src: [child('a', 'file'), child('b', 'file')] },
      'tooMany',
    ],
    ['a file past the ceiling', { src: [child('big', 'file', 99)] }, 'tooLarge'],
    ['a link', { src: [child('link', 'symlink')] }, 'unavailable'],
    ['a device', { src: [child('fifo', 'other')] }, 'unavailable'],
    [
      'a name that is not UTF-8',
      { src: [child('x', 'file', 4, { unreadableName: true })] },
      'unavailable',
    ],
    ['a name no route can write back', { src: [child('a\\b', 'file')] }, 'unavailable'],
  ])('keeps nothing of a folder with %s — S-337', async (_, tree, reason) => {
    const store = new InMemoryFileHistory();
    const keeping = await aHistoryKeeper(treeDisk(tree), {
      store,
      maxBatchEntries: 2,
      maxFileBytes: 50,
    }).keepForDelete(at('src'), '/srv/app/src', folderFound, owner);

    expect(keeping).toEqual({ kept: false, reason });
    expect(store.entries).toEqual([]);
  });

  it('keeps nothing of a file past the ceiling, or of a link', async () => {
    const keeper = aHistoryKeeper(treeDisk({}), { maxFileBytes: 3 });

    expect(await keeper.keepForDelete(at('a.ts'), '/srv/app/a.ts', fileFound, owner)).toEqual({
      kept: false,
      reason: 'tooLarge',
    });
    expect(
      await keeper.keepForDelete(
        at('l'),
        '/srv/app/l',
        { kind: 'symlink', size: 3, identity: '1:3' },
        owner,
      ),
    ).toEqual({ kept: false, reason: 'unavailable' });
  });

  it('keeps nothing when a file grew past the ceiling while the folder was kept', async () => {
    const store = new InMemoryFileHistory();
    const disk = treeDisk(
      { src: [child('a.ts', 'file')] },
      { read: (file) => Promise.reject(new FileTooLargeError(file.relative, 9, 4, 'bytes')) },
    );

    expect(
      await aHistoryKeeper(disk, { store }).keepForDelete(at('src'), '/s', folderFound, owner),
    ).toEqual({ kept: false, reason: 'tooLarge' });
    expect(store.entries).toEqual([]);
  });

  it('keeps nothing, and reports, when the history fails — S-337', async () => {
    const store = new InMemoryFileHistory();
    const failures: { error: unknown; path: string }[] = [];
    store.failure = new Error('database down');

    expect(
      await aHistoryKeeper(treeDisk({ src: [] }), { store, failures }).keepForDelete(
        at('src'),
        '/s',
        folderFound,
        owner,
      ),
    ).toEqual({ kept: false, reason: 'unavailable' });
    expect(failures.map((failure) => failure.path)).toEqual(['src']);
  });
});

describe('HistoryKeeper — what was kept, against the disk right before it goes', () => {
  async function keptFolder(tree: Record<string, TreeChild[]>) {
    const keeper = aHistoryKeeper(treeDisk(tree));
    const batch = (await keeper.keepForDelete(at('src'), '/s', folderFound, owner)) as KeptBatch;

    return { keeper, batch };
  }

  it('a folder as it was is unchanged', async () => {
    const tree = { src: [child('a.ts', 'file')] };
    const { batch } = await keptFolder(tree);

    expect(await aHistoryKeeper(treeDisk(tree)).unchanged(at('src'), '/s', batch)).toBe(true);
  });

  it.each([
    ['a file added', { src: [child('a.ts', 'file'), child('b.ts', 'file')] }],
    ['a file grown', { src: [child('a.ts', 'file', 5)] }],
    ['a file touched', { src: [{ ...child('a.ts', 'file'), mtime: new Date(0) }] }],
    ['a link added', { src: [child('a.ts', 'file'), child('l', 'symlink')] }],
  ])('a folder with %s is changed', async (_, after) => {
    const { batch } = await keptFolder({ src: [child('a.ts', 'file')] });

    expect(await aHistoryKeeper(treeDisk(after)).unchanged(at('src'), '/s', batch)).toBe(false);
  });

  it('a folder gone, or now a file, is changed', async () => {
    const { batch } = await keptFolder({ src: [] });
    const gone = treeDisk({}, { inspect: () => Promise.resolve(null) });

    expect(await aHistoryKeeper(gone).unchanged(at('src'), '/s', batch)).toBe(false);
    expect(await aHistoryKeeper(treeDisk({})).unchanged(at('src'), '/s', batch)).toBe(false);
  });

  it('a file is unchanged by its hash, and changed by another, or by none', async () => {
    const keeper = aHistoryKeeper(treeDisk({}));
    const batch = (await keeper.keepForDelete(at('a.ts'), '/a', fileFound, owner)) as KeptBatch;
    const other = treeDisk({}, { version: () => Promise.resolve(Etag.of(Buffer.from('x'))) });
    const none = treeDisk({}, { version: () => Promise.resolve(null) });

    expect(await keeper.unchanged(at('a.ts'), '/a', batch)).toBe(true);
    expect(await aHistoryKeeper(other).unchanged(at('a.ts'), '/a', batch)).toBe(false);
    expect(await aHistoryKeeper(none).unchanged(at('a.ts'), '/a', batch)).toBe(false);
  });

  it('forgets a batch, and only reports a store that cannot', async () => {
    const store = new InMemoryFileHistory();
    const failures: { error: unknown; path: string }[] = [];
    const keeper = aHistoryKeeper(treeDisk({ src: [] }), { store, failures });
    const batch = (await keeper.keepForDelete(at('src'), '/s', folderFound, owner)) as KeptBatch;

    await keeper.discard(batch, 'src');
    expect(store.entries).toEqual([]);

    store.discard = () => Promise.reject(new Error('down'));
    await expect(keeper.discard(batch, 'src')).resolves.toBeUndefined();
    expect(failures.map((failure) => failure.path)).toEqual(['src']);
  });
});
