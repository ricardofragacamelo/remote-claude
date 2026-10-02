import { describe, expect, it } from 'vitest';

import { RecordAuditEventUseCase } from '@application/audit';
import { CreateEntryUseCase, FileTrail, UserWrites } from '@application/files';
import type { CreateEntryCommand, FolderDisk } from '@application/files';
import { UserId } from '@domain/auth';
import { Etag, FileExistsError, FileTooLargeError } from '@domain/files';
import { WorkspacePath } from '@domain/workspace';
import { IconvTextCodec } from '@adapter/outbound/files/iconv.text-codec';
import { InMemoryPathLock } from '@shared/concurrency/in-memory-path-lock';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { RecordingAuditEvents } from '../../../support/fakes/recording-audit-events';
import { SequentialIds } from '../../../support/fakes/sequential-ids';
import { stubFolderDisk } from '../../../support/fakes/stub-folder-disk';

const owner = UserId.create('auth|42');
const folder = WorkspacePath.create('/srv/app');

const command = (overrides: Partial<CreateEntryCommand> = {}): CreateEntryCommand => ({
  folder: folder.value,
  path: 'a.ts',
  kind: 'file',
  content: 'x\n',
  encoding: 'utf8',
  bom: false,
  confirmSensitive: false,
  ...overrides,
});

function creator(disk: FolderDisk, events = new RecordingAuditEvents()): CreateEntryUseCase {
  return new CreateEntryUseCase({
    folders: { resolve: () => Promise.resolve(folder) },
    disk: disk,
    codec: new IconvTextCodec(),
    lock: new InMemoryPathLock(),
    trail: new FileTrail(
      new RecordAuditEventUseCase(events, new SequentialIds()),
      new FixedClock(new Date(0)),
      () => undefined,
    ),
    limits: { maxEditBytes: 4 },
    writes: new UserWrites(new FixedClock(new Date(0))),
  });
}

describe('CreateEntryUseCase', () => {
  it('creates a file with its contents, in the trail first — S-81', async () => {
    const events = new RecordingAuditEvents();
    const created: (Uint8Array | null)[] = [];
    const disk = stubFolderDisk({
      inspect: () => Promise.resolve(null),
      create: (_entry, content) => (created.push(content), Promise.resolve()),
    });

    const entry = await creator(disk, events).execute(command(), owner);

    expect(entry.etag).toEqual(Etag.of(Buffer.from('x\n')));
    expect(created).toEqual([Buffer.from('x\n')]);
    expect(events.appended[0]?.details).toMatchObject({ entryKind: 'file', sizeBytes: 2 });
  });

  it('creates a folder, with no contents and no version — S-82', async () => {
    const disk = stubFolderDisk({
      inspect: () => Promise.resolve(null),
      create: () => Promise.resolve(),
    });

    expect((await creator(disk).execute(command({ kind: 'directory' }), owner)).etag).toBeNull();
  });

  it('refuses contents past the editing ceiling before the disk', async () => {
    await expect(
      creator(stubFolderDisk({})).execute(command({ content: 'too long' }), owner),
    ).rejects.toBeInstanceOf(FileTooLargeError);
  });

  it('answers what is there with its version, and creates nothing — S-84, S-88', async () => {
    const theirs = Etag.of(Buffer.from('x\n'));
    const disk = stubFolderDisk({
      inspect: () => Promise.resolve({ kind: 'file', size: 2, identity: '1:1' }),
      version: () => Promise.resolve(theirs),
    });

    await expect(creator(disk).execute(command(), owner)).rejects.toMatchObject({
      code: 'FILE_EXISTS',
      params: { currentEtag: theirs.value },
    });
  });

  it('answers a folder that is there with no version', async () => {
    const disk = stubFolderDisk({
      inspect: () => Promise.resolve({ kind: 'directory', size: 0, identity: '1:1' }),
      version: () => Promise.resolve(null),
    });

    const refused = await creator(disk)
      .execute(command(), owner)
      .catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(FileExistsError);
    expect((refused as FileExistsError).params).toMatchObject({ currentEtag: null });
  });
});
