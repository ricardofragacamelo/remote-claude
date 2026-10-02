import { beforeEach, describe, expect, it } from 'vitest';

import { RecordAuditEventUseCase } from '@application/audit';
import { FileTrail, SaveFileUseCase, UserWrites } from '@application/files';
import type { FolderDisk, SaveFileCommand } from '@application/files';
import { UserId } from '@domain/auth';
import {
  Etag,
  FileChangedError,
  FileNotAFileError,
  FileTooLargeError,
  FileTrailUnavailableError,
  PreconditionRequiredError,
  StorageFullError,
  UnknownEncodingError,
} from '@domain/files';
import { WorkspacePath } from '@domain/workspace';
import { IconvTextCodec } from '@adapter/outbound/files/iconv.text-codec';
import { InMemoryPathLock } from '@shared/concurrency/in-memory-path-lock';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { RecordingAuditEvents } from '../../../support/fakes/recording-audit-events';
import { SequentialIds } from '../../../support/fakes/sequential-ids';
import { aHistoryKeeper } from '../../../support/fakes/in-memory-file-history';
import { stubFolderDisk } from '../../../support/fakes/stub-folder-disk';

const owner = UserId.create('auth|42');
const folder = WorkspacePath.create('/srv/projects/app');
const one = Etag.of(Buffer.from('one\n'));
const two = Etag.of(Buffer.from('two\n'));

const command = (overrides: Partial<SaveFileCommand> = {}): SaveFileCommand => ({
  folder: folder.value,
  path: 'a.ts',
  content: 'two\n',
  encoding: 'utf8',
  bom: false,
  ifMatch: one.value,
  confirmSensitive: false,
  ...overrides,
});

/** A disk with one file holding `one\n`, whose write lands and reports what it wrote. */
function diskWith(current: Etag | null, overrides: Partial<FolderDisk> = {}): FolderDisk {
  return stubFolderDisk({
    inspect: () =>
      Promise.resolve(current === null ? null : { kind: 'file', size: 4, identity: '1:1' }),
    version: () => Promise.resolve(current),
    write: (_file, bytes, guard) => {
      guard(current);
      return Promise.resolve({ size: bytes.length, mtime: new Date(0) });
    },
    read: () => Promise.resolve({ bytes: Buffer.from('one\n'), mtime: new Date(0) }),
    ...overrides,
  });
}

describe('SaveFileUseCase', () => {
  let events: RecordingAuditEvents;
  let lock: InMemoryPathLock;

  beforeEach(() => {
    events = new RecordingAuditEvents();
    lock = new InMemoryPathLock();
  });

  const save = (disk: FolderDisk, limit = 1_000): SaveFileUseCase =>
    new SaveFileUseCase(
      {
        folders: { resolve: () => Promise.resolve(folder) },
        disk: disk,
        codec: new IconvTextCodec(),
        lock: lock,
        trail: new FileTrail(
          new RecordAuditEventUseCase(events, new SequentialIds()),
          new FixedClock(new Date(0)),
          () => undefined,
        ),
        limits: { maxEditBytes: limit },
        writes: new UserWrites(new FixedClock(new Date(0))),
      },
      aHistoryKeeper(disk),
    );

  it('writes over the version it names, in the trail first — S-62, S-116', async () => {
    const saved = await save(diskWith(one)).execute(command(), owner);

    expect(saved).toMatchObject({ etag: two, size: 4, written: true });
    expect(events.kinds).toEqual(['file.written']);
    expect(events.appended[0]?.details).toMatchObject({
      hashBefore: one.value,
      hashAfter: two.value,
      sizeBytes: 4,
      sensitive: false,
    });
  });

  it.each([[null], ['*']])(
    'needs an If-Match that is a version, not %j — S-63',
    async (ifMatch) => {
      await expect(save(diskWith(one)).execute(command({ ifMatch }), owner)).rejects.toMatchObject({
        code: 'PRECONDITION_REQUIRED',
        params: { reason: 'ifMatchMissing' },
      });
    },
  );

  it('refuses another version, and says the one on disk — S-64', async () => {
    await expect(
      save(diskWith(two)).execute(command({ content: 'mine\n' }), owner),
    ).rejects.toMatchObject({ code: 'FILE_CHANGED', params: { currentEtag: two.value } });
  });

  it('never matches a weak tag — S-65', async () => {
    await expect(
      save(diskWith(one)).execute(command({ ifMatch: `W/${one.value}` }), owner),
    ).rejects.toBeInstanceOf(FileChangedError);
  });

  it('answers what the disk already holds without writing or recording — S-66', async () => {
    const saved = await save(
      diskWith(two, { write: () => Promise.reject(new Error('no')) }),
    ).execute(command({ ifMatch: one.value }), owner);

    expect(saved).toMatchObject({ etag: two, written: false });
    expect(events.kinds).toEqual([]);
  });

  it('never re-creates a file that is gone — S-68', async () => {
    await expect(save(diskWith(null)).execute(command(), owner)).rejects.toMatchObject({
      code: 'FILE_CHANGED',
      params: { currentEtag: null },
    });
  });

  it('refuses a folder or a device as what is saved over', async () => {
    for (const kind of ['directory', 'other'] as const) {
      const disk = stubFolderDisk({
        inspect: () => Promise.resolve({ kind, size: 0, identity: '1:1' }),
      });

      await expect(save(disk).execute(command(), owner)).rejects.toBeInstanceOf(FileNotAFileError);
    }
  });

  it('stops at the guard when the disk changed right before the rename', async () => {
    for (const onDisk of [null, two]) {
      const disk = diskWith(one, {
        write: (_file, _bytes, guard) => {
          guard(onDisk);
          return Promise.resolve({ size: 0, mtime: new Date(0) });
        },
      });

      await expect(save(disk).execute(command(), owner)).rejects.toBeInstanceOf(FileChangedError);
    }
  });

  it('refuses a text past the ceiling and an unknown encoding before the disk — S-76, S-50', async () => {
    const untouched = stubFolderDisk({});

    await expect(save(untouched, 3).execute(command(), owner)).rejects.toBeInstanceOf(
      FileTooLargeError,
    );
    await expect(
      save(untouched).execute(command({ encoding: 'klingon' }), owner),
    ).rejects.toBeInstanceOf(UnknownEncodingError);
  });

  it('asks for the second step of a file that changes what Claude may do, then marks it — S-79', async () => {
    const sensitive = command({ path: '.claude/settings.json' });

    await expect(save(diskWith(one)).execute(sensitive, owner)).rejects.toMatchObject({
      code: 'PRECONDITION_REQUIRED',
      params: { reason: 'sensitiveFile' },
    });

    await save(diskWith(one)).execute({ ...sensitive, confirmSensitive: true }, owner);
    expect(events.appended[0]?.details).toMatchObject({ sensitive: true });
  });

  it('writes nothing when the trail is down — S-117', async () => {
    events.failure = new Error('gone');
    let written = false;
    const disk = diskWith(one, {
      write: () => {
        written = true;
        return Promise.resolve({ size: 0, mtime: new Date(0) });
      },
    });

    await expect(save(disk).execute(command(), owner)).rejects.toBeInstanceOf(
      FileTrailUnavailableError,
    );
    expect(written).toBe(false);
  });

  it('records the failure of the disk against the fact, and lets go of the lock — S-118, S-127', async () => {
    const disk = diskWith(one, {
      write: () => Promise.reject(new StorageFullError('a.ts')),
    });

    await expect(save(disk).execute(command(), owner)).rejects.toBeInstanceOf(StorageFullError);
    expect(events.kinds).toEqual(['file.written', 'file.failed']);
    expect(events.appended[1]?.details).toEqual({
      failedEventId: events.appended[0]?.id,
      kind: 'file.written',
      code: 'STORAGE_FULL',
    });
    expect(lock.held).toBe(0);
  });

  it('takes the lock on the real path the disk located', async () => {
    const seen: string[] = [];
    const watching = {
      run: <T>(path: string, work: () => Promise<T>) => (seen.push(path), work()),
    };
    const disk = diskWith(one, { locate: () => Promise.resolve('/srv/projects/app/real.ts') });
    const useCase = new SaveFileUseCase(
      {
        folders: { resolve: () => Promise.resolve(folder) },
        disk,
        codec: new IconvTextCodec(),
        lock: watching,
        trail: new FileTrail(
          new RecordAuditEventUseCase(events, new SequentialIds()),
          new FixedClock(new Date(0)),
          () => undefined,
        ),
        limits: { maxEditBytes: 1_000 },
        writes: new UserWrites(new FixedClock(new Date(0))),
      },
      aHistoryKeeper(disk),
    );

    await useCase.execute(command({ path: 'link.ts' }), owner);

    expect(seen).toEqual(['/srv/projects/app/real.ts']);
  });

  it('is refused by the precondition before anything else is asked', async () => {
    await expect(
      save(stubFolderDisk({})).execute(command({ ifMatch: null }), owner),
    ).rejects.toBeInstanceOf(PreconditionRequiredError);
  });
});
