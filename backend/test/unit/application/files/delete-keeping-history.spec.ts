import { describe, expect, it } from 'vitest';

import { DeleteEntryUseCase } from '@application/files';
import type { DeleteEntryCommand, FolderDisk } from '@application/files';
import { UserId } from '@domain/auth';
import { Etag, StorageFullError } from '@domain/files';
import type { TreeChild } from '@domain/files';
import { historyWriting, HISTORY_FOLDER } from '../../../support/files/history-writing';
import { stubFolderDisk } from '../../../support/fakes/stub-folder-disk';

const owner = UserId.create('auth|42');
const mtime = new Date('2026-10-01T10:00:00.000Z');
const limits = { deleteCountCap: 100 };

const command = (overrides: Partial<DeleteEntryCommand> = {}): DeleteEntryCommand => ({
  folder: HISTORY_FOLDER.value,
  path: 'a.ts',
  recursive: false,
  expectedEntries: null,
  ifMatch: null,
  confirmSensitive: false,
  keepInHistory: true,
  ...overrides,
});

function child(name: string, kind: TreeChild['kind'], size = 4): TreeChild {
  return { name, kind, size, mtime, unreadableName: false, target: null };
}

/** A disk with one file `a.ts` and a folder `src` holding `b.ts`; it records what it removed. */
function aDisk(overrides: Partial<FolderDisk> = {}) {
  const removed: { path: string; recursive: boolean }[] = [];
  const disk = stubFolderDisk({
    inspect: (entry) =>
      Promise.resolve(
        entry.relative === 'src'
          ? { kind: 'directory', size: 0, identity: '1:1' }
          : { kind: 'file', size: 4, identity: '1:2' },
      ),
    version: (file) => Promise.resolve(Etag.of(Buffer.from(file.relative))),
    read: (file) => Promise.resolve({ bytes: Buffer.from(file.relative), mtime }),
    list: (directory) =>
      Promise.resolve({
        children: directory.relative === 'src' ? [child('b.ts', 'file')] : [],
        exhausted: true,
      }),
    count: () => Promise.resolve({ count: 1, capped: false }),
    remove: (entry, recursive) => {
      removed.push({ path: entry.relative, recursive });
      return Promise.resolve();
    },
    ...overrides,
  });

  return { disk, removed };
}

describe('DeleteEntryUseCase with keepInHistory — B-57', () => {
  it('keeps a file, then records and removes it, and answers the batch — S-335', async () => {
    const { disk, removed } = aDisk();
    const parts = historyWriting(disk);
    const deleted = await new DeleteEntryUseCase(parts.writing, limits, parts.keeper).execute(
      command(),
      owner,
    );

    expect(deleted.kept).toMatchObject({ entries: [{ label: 'a.ts', reason: 'delete' }] });
    expect(removed).toEqual([{ path: 'a.ts', recursive: true }]);
    expect(parts.events.kinds).toEqual(['file.deleted']);
    expect(parts.events.appended[0]?.details).toMatchObject({
      keptBatchId: deleted.kept?.batchId,
      entryKind: 'file',
    });
  });

  it('keeps a whole folder without asking the count — S-335', async () => {
    const { disk, removed } = aDisk();
    const parts = historyWriting(disk);
    const deleted = await new DeleteEntryUseCase(parts.writing, limits, parts.keeper).execute(
      command({ path: 'src' }),
      owner,
    );

    expect(deleted.kept?.entries.map((entry) => entry.label)).toEqual(['src', 'src/b.ts']);
    expect(removed).toEqual([{ path: 'src', recursive: true }]);
    expect(parts.events.appended[0]?.details).toMatchObject({ entryCount: 1 });
  });

  it('removes nothing of a file the history did not take: 428 notKept — S-337', async () => {
    const { disk, removed } = aDisk();
    const parts = historyWriting(disk, { maxFileBytes: 3 });

    await expect(
      new DeleteEntryUseCase(parts.writing, limits, parts.keeper).execute(command(), owner),
    ).rejects.toMatchObject({
      code: 'PRECONDITION_REQUIRED',
      params: { reason: 'notKept', why: 'tooLarge' },
    });
    expect(removed).toEqual([]);
    expect(parts.events.kinds).toEqual([]);
  });

  it('removes nothing when the history is down, and says unavailable — S-337', async () => {
    const { disk, removed } = aDisk();
    const parts = historyWriting(disk);
    parts.store.failure = new Error('down');

    await expect(
      new DeleteEntryUseCase(parts.writing, limits, parts.keeper).execute(command(), owner),
    ).rejects.toMatchObject({ params: { reason: 'notKept', why: 'unavailable' } });
    await expect(
      new DeleteEntryUseCase(parts.writing, limits, parts.keeper).execute(
        command({ path: 'src' }),
        owner,
      ),
    ).rejects.toMatchObject({
      code: 'DIRECTORY_NOT_EMPTY',
      params: { entryCount: 1, entryCountCapped: false, notKept: 'unavailable' },
    });
    expect(removed).toEqual([]);
  });

  it('removes nothing of a folder with too many entries, and gives the count back — S-337', async () => {
    const { disk, removed } = aDisk();
    const parts = historyWriting(disk, { maxBatchEntries: 1 });

    await expect(
      new DeleteEntryUseCase(parts.writing, limits, parts.keeper).execute(
        command({ path: 'src' }),
        owner,
      ),
    ).rejects.toMatchObject({ code: 'DIRECTORY_NOT_EMPTY', params: { notKept: 'tooMany' } });
    expect(removed).toEqual([]);
  });

  it('removes nothing when the entry changed after it was kept: 412, and forgets the batch', async () => {
    let versions = 0;
    const { disk, removed } = aDisk({
      // The first version is the If-Match check, the second the keeping's; the third is Claude's.
      version: () => {
        versions += 1;
        return Promise.resolve(Etag.of(Buffer.from(versions > 1 ? 'claude' : 'a.ts')));
      },
    });
    const parts = historyWriting(disk);

    await expect(
      new DeleteEntryUseCase(parts.writing, limits, parts.keeper).execute(command(), owner),
    ).rejects.toMatchObject({ code: 'FILE_CHANGED' });
    expect(removed).toEqual([]);
    expect(parts.store.entries).toEqual([]);
    expect(parts.store.discarded).toHaveLength(1);
  });

  it('forgets the batch when the trail refuses, and removes nothing', async () => {
    const { disk, removed } = aDisk();
    const parts = historyWriting(disk);
    parts.events.failure = new Error('database down');

    await expect(
      new DeleteEntryUseCase(parts.writing, limits, parts.keeper).execute(command(), owner),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(removed).toEqual([]);
    expect(parts.store.entries).toEqual([]);
  });

  it('keeps the batch when the disk refuses after the trail: some of it may be gone', async () => {
    const { disk } = aDisk({ remove: () => Promise.reject(new StorageFullError('a.ts')) });
    const parts = historyWriting(disk);

    await expect(
      new DeleteEntryUseCase(parts.writing, limits, parts.keeper).execute(command(), owner),
    ).rejects.toBeInstanceOf(StorageFullError);
    expect(parts.store.entries).toHaveLength(1);
    expect(parts.events.kinds).toEqual(['file.deleted', 'file.failed']);
  });

  it('leaves the definitive delete as it was: no history, no batch in the trail', async () => {
    const { disk, removed } = aDisk();
    const parts = historyWriting(disk);
    const deleted = await new DeleteEntryUseCase(parts.writing, limits, parts.keeper).execute(
      command({ keepInHistory: false }),
      owner,
    );

    expect(deleted).toEqual({ kept: null });
    expect(removed).toEqual([{ path: 'a.ts', recursive: false }]);
    expect(parts.store.entries).toEqual([]);
    expect(parts.events.appended[0]?.details).not.toHaveProperty('keptBatchId');
  });
});
