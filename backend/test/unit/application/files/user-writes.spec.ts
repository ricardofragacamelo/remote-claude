import { describe, expect, it } from 'vitest';

import { RecordAuditEventUseCase } from '@application/audit';
import {
  CopyEntryUseCase,
  CreateEntryUseCase,
  DeleteEntryUseCase,
  EntryRelocator,
  FileTrail,
  MoveEntryUseCase,
  RecentWrites,
  SaveFileUseCase,
  UserWrites,
} from '@application/files';
import type { FileWriting, FolderDisk } from '@application/files';
import { UserId } from '@domain/auth';
import { Etag } from '@domain/files';
import type { FilePath } from '@domain/files';
import { WorkspacePath } from '@domain/workspace';
import { IconvTextCodec } from '@adapter/outbound/files/iconv.text-codec';
import { InMemoryPathLock } from '@shared/concurrency/in-memory-path-lock';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { RecordingAuditEvents } from '../../../support/fakes/recording-audit-events';
import { SequentialIds } from '../../../support/fakes/sequential-ids';
import { aHistoryKeeper } from '../../../support/fakes/in-memory-file-history';
import { stubFolderDisk } from '../../../support/fakes/stub-folder-disk';

const owner = UserId.create('auth|42');
const folder = WorkspacePath.create('/srv/app');
const now = new Date(Date.UTC(2026, 9, 1, 12, 0, 0));
const later = (ms: number): Date => new Date(now.getTime() + ms);
const one = Etag.of(Buffer.from('one\n'));
const two = Etag.of(Buffer.from('two\n'));

describe('RecentWrites — what one writer wrote lately — B-22', () => {
  it('finds a write by its path, and the subtree writes of the folders above it', () => {
    const writes = new RecentWrites('user');
    writes.remember({ path: '/srv/app/a.ts', left: { kind: 'removed' }, subtree: false, at: now });
    writes.remember({ path: '/srv/app/lib', left: { kind: 'anything' }, subtree: true, at: now });
    writes.remember({ path: '/srv/app/src', left: { kind: 'removed' }, subtree: false, at: now });

    expect(writes.marksFor('/srv/app/a.ts', now)).toEqual([
      { by: 'user', at: now, left: { kind: 'removed' } },
    ]);
    expect(writes.marksFor('/srv/app/lib/deep/x.ts', now)).toEqual([
      { by: 'user', at: now, left: { kind: 'anything' } },
    ]);
    expect(writes.marksFor('/srv/app/src/x.ts', now)).toEqual([]);
    expect(writes.marksFor('/srv/elsewhere', now)).toEqual([]);
  });

  it('forgets a write once it is older than its memory', () => {
    const writes = new RecentWrites('claude', 1_000);
    writes.remember({ path: '/a', left: { kind: 'removed' }, subtree: false, at: now });

    expect(writes.marksFor('/a', later(1_000))).toHaveLength(1);
    expect(writes.marksFor('/a', later(1_001))).toEqual([]);
  });

  it('keeps the latest write of a path, and drops the oldest when full', () => {
    const writes = new RecentWrites('user', 60_000, 2);
    writes.remember({ path: '/a', left: { kind: 'removed' }, subtree: false, at: now });
    writes.remember({ path: '/b', left: { kind: 'removed' }, subtree: false, at: now });
    writes.remember({ path: '/a', left: { kind: 'anything' }, subtree: false, at: later(1) });
    writes.remember({ path: '/c', left: { kind: 'removed' }, subtree: false, at: later(2) });

    expect(writes.marksFor('/b', later(2))).toEqual([]);
    expect(writes.marksFor('/a', later(2))).toEqual([
      { by: 'user', at: later(1), left: { kind: 'anything' } },
    ]);
  });

  it("stamps the person's writes with the clock", () => {
    const writes = new UserWrites(new FixedClock(now));

    writes.left('/srv/app/a.ts', { kind: 'content', hash: one.digest }, false);

    expect(writes.marksFor('/srv/app/a.ts', now)).toEqual([
      { by: 'user', at: now, left: { kind: 'content', hash: one.digest } },
    ]);
  });
});

/** Every write use case over one disk, recording into one memory. */
function writing(disk: FolderDisk): { writes: UserWrites; bundle: FileWriting } {
  const writes = new UserWrites(new FixedClock(now));

  return {
    writes,
    bundle: {
      folders: { resolve: () => Promise.resolve(folder) },
      disk,
      codec: new IconvTextCodec(),
      lock: new InMemoryPathLock(),
      trail: new FileTrail(
        new RecordAuditEventUseCase(new RecordingAuditEvents(), new SequentialIds()),
        new FixedClock(now),
        () => undefined,
      ),
      limits: { maxEditBytes: 1_000 },
      writes,
    },
  };
}

const file = { kind: 'file' as const, size: 4, identity: '1:1' };
const directory = { kind: 'directory' as const, size: 0, identity: '1:2' };
const limits = { copyEntries: 100, copyBytes: 1_000, deleteCountCap: 100 };
const relocate = {
  folder: folder.value,
  from: 'a.ts',
  to: 'b.ts',
  ifMatch: null,
  confirmSensitive: false,
};

describe("the person's writes leave their mark — B-22", () => {
  it('a save leaves the bytes it wrote', async () => {
    const { writes, bundle } = writing(
      stubFolderDisk({
        inspect: () => Promise.resolve(file),
        version: () => Promise.resolve(one),
        write: () => Promise.resolve({ size: 4, mtime: now }),
      }),
    );

    await new SaveFileUseCase(bundle, aHistoryKeeper(bundle.disk)).execute(
      {
        folder: folder.value,
        path: 'a.ts',
        content: 'two\n',
        encoding: 'utf8',
        bom: false,
        ifMatch: one.value,
        confirmSensitive: false,
      },
      owner,
    );

    expect(writes.marksFor('/srv/app/a.ts', now)).toEqual([
      { by: 'user', at: now, left: { kind: 'content', hash: two.digest } },
    ]);
  });

  it('a folder created leaves something whose bytes are not known', async () => {
    const { writes, bundle } = writing(
      stubFolderDisk({
        inspect: () => Promise.resolve(null),
        create: () => Promise.resolve(),
      }),
    );

    await new CreateEntryUseCase(bundle).execute(
      {
        folder: folder.value,
        path: 'lib',
        kind: 'directory',
        content: '',
        encoding: 'utf8',
        bom: false,
        confirmSensitive: false,
      },
      owner,
    );

    expect(writes.marksFor('/srv/app/lib', now)).toEqual([
      { by: 'user', at: now, left: { kind: 'anything' } },
    ]);
  });

  it('a delete leaves nothing, under the whole of what it removed', async () => {
    const { writes, bundle } = writing(
      stubFolderDisk({
        inspect: () => Promise.resolve(directory),
        count: () => Promise.resolve({ count: 2, capped: false }),
        remove: () => Promise.resolve(),
      }),
    );

    await new DeleteEntryUseCase(bundle, limits, aHistoryKeeper(bundle.disk)).execute(
      {
        folder: folder.value,
        path: 'old',
        recursive: true,
        expectedEntries: 2,
        ifMatch: null,
        confirmSensitive: false,
        keepInHistory: false,
      },
      owner,
    );

    expect(writes.marksFor('/srv/app/old/inner/x.ts', now)).toEqual([
      { by: 'user', at: now, left: { kind: 'removed' } },
    ]);
  });

  it('a move leaves the bytes at the destination and nothing at the source', async () => {
    const disk = stubFolderDisk({
      inspect: (entry: FilePath) => Promise.resolve(entry.relative === 'a.ts' ? file : null),
      version: () => Promise.resolve(one),
      move: () => Promise.resolve(),
    });
    const { writes, bundle } = writing(disk);

    await new MoveEntryUseCase(new EntryRelocator(bundle), disk).execute(relocate, owner);

    expect(writes.marksFor('/srv/app/b.ts', now)).toEqual([
      { by: 'user', at: now, left: { kind: 'content', hash: one.digest } },
    ]);
    expect(writes.marksFor('/srv/app/a.ts', now)).toEqual([
      { by: 'user', at: now, left: { kind: 'removed' } },
    ]);
  });

  it('a folder copied leaves anything under the destination, and the source alone', async () => {
    const disk = stubFolderDisk({
      inspect: (entry: FilePath) => Promise.resolve(entry.relative === 'a.ts' ? directory : null),
      copy: () => Promise.resolve(),
    });
    const { writes, bundle } = writing(disk);

    await new CopyEntryUseCase(new EntryRelocator(bundle), disk, limits).execute(relocate, owner);

    expect(writes.marksFor('/srv/app/b.ts/inner.ts', now)).toEqual([
      { by: 'user', at: now, left: { kind: 'anything' } },
    ]);
    expect(writes.marksFor('/srv/app/a.ts', now)).toEqual([]);
  });
});
