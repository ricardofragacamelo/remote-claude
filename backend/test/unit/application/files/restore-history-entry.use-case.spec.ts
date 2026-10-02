import { beforeEach, describe, expect, it } from 'vitest';

import { RestoreHistoryEntryUseCase } from '@application/files';
import type { FolderDisk, RestoreEntryCommand } from '@application/files';
import { UserId } from '@domain/auth';
import { Etag, FileExistsError } from '@domain/files';
import type { EntryKind } from '@domain/files';
import { historyWriting, HISTORY_FOLDER } from '../../../support/files/history-writing';
import type { HistoryWriting } from '../../../support/files/history-writing';
import { stubFolderDisk } from '../../../support/fakes/stub-folder-disk';

const owner = UserId.create('auth|42');
const kept = Buffer.from('kept\n');
const now = Buffer.from('now\n');

/** What is on disk at the path being restored, and what the disk was asked to do. */
interface Scene {
  onDisk: { kind: EntryKind; bytes: Buffer | null } | null;
  readonly calls: string[];
}

function aDisk(scene: Scene, overrides: Partial<FolderDisk> = {}): FolderDisk {
  return stubFolderDisk({
    inspect: () =>
      Promise.resolve(
        scene.onDisk === null
          ? null
          : { kind: scene.onDisk.kind, size: scene.onDisk.bytes?.length ?? 0, identity: '1:1' },
      ),
    version: () =>
      Promise.resolve(scene.onDisk?.bytes == null ? null : Etag.of(scene.onDisk.bytes)),
    read: () =>
      Promise.resolve({ bytes: scene.onDisk?.bytes ?? Buffer.alloc(0), mtime: new Date(0) }),
    write: (_file, bytes, guard) => {
      guard(scene.onDisk?.bytes == null ? null : Etag.of(scene.onDisk.bytes));
      scene.calls.push(`write:${Buffer.from(bytes).toString()}`);
      return Promise.resolve({ size: bytes.length, mtime: new Date(0) });
    },
    create: (entry, content) => {
      scene.calls.push(`create:${entry.relative}:${content === null ? 'folder' : 'file'}`);
      return Promise.resolve();
    },
    ...overrides,
  });
}

describe('RestoreHistoryEntryUseCase — B-58', () => {
  let scene: Scene;
  let parts: HistoryWriting;
  let fileId: string;
  let folderId: string;

  async function setUp(onDisk: Scene['onDisk'], overrides: Partial<FolderDisk> = {}) {
    scene = { onDisk, calls: [] };
    parts = historyWriting(aDisk(scene, overrides));
    const [file, folder] = await parts.store.keep([
      {
        id: 'FILEENTRY',
        userId: owner,
        path: '/srv/app/src/a.ts',
        label: 'src/a.ts',
        reason: 'delete',
        batchId: 'BATCH',
        createdAt: new Date(0),
        contents: { kind: 'file', read: () => Promise.resolve(kept) },
      },
      {
        id: 'FOLDERENTRY',
        userId: owner,
        path: '/srv/app/src',
        label: 'src',
        reason: 'delete',
        batchId: 'BATCH',
        createdAt: new Date(0),
        contents: { kind: 'directory' },
      },
    ]);
    fileId = String(file?.id);
    folderId = String(folder?.id);
  }

  const restore = (overrides: Partial<RestoreEntryCommand> = {}) =>
    new RestoreHistoryEntryUseCase(parts.writing, parts.store, parts.keeper).execute(
      {
        folder: HISTORY_FOLDER.value,
        entryId: fileId,
        ifMatch: null,
        confirmSensitive: false,
        ...overrides,
      },
      owner,
    );

  beforeEach(async () => {
    await setUp(null);
  });

  it('with If-Match, writes over the current one and keeps it first — S-338', async () => {
    await setUp({ kind: 'file', bytes: now });

    const restored = await restore({ ifMatch: Etag.of(now).value });

    expect(restored).toMatchObject({ etag: Etag.of(kept), written: true, size: kept.length });
    expect(restored.history).toMatchObject({ kept: true });
    expect(scene.calls).toEqual(['write:kept\n']);
    expect(parts.store.entries.at(-1)).toMatchObject({
      reason: 'restore',
      hash: Etag.of(now).digest,
    });
    expect(parts.events.kinds).toEqual(['file.restored']);
    expect(parts.events.appended[0]?.details).toMatchObject({
      entryId: fileId,
      replaced: true,
      hashBefore: Etag.of(now).value,
      hashAfter: Etag.of(kept).value,
    });
  });

  it.each([
    ['changed', { kind: 'file' as const, bytes: Buffer.from('claude\n') }],
    ['gone', null],
    ['a folder now', { kind: 'directory' as const, bytes: null }],
  ])('with If-Match, refuses a current version that is %s: 412 — S-339', async (_, onDisk) => {
    await setUp(onDisk);

    await expect(restore({ ifMatch: Etag.of(now).value })).rejects.toMatchObject({
      code: 'FILE_CHANGED',
    });
    expect(scene.calls).toEqual([]);
    expect(parts.events.kinds).toEqual([]);
  });

  it('without If-Match, re-creates what was deleted — S-340', async () => {
    const restored = await restore();

    expect(restored).toMatchObject({ written: true, history: null, etag: Etag.of(kept) });
    expect(scene.calls).toEqual(['create:src/a.ts:file']);
    expect(parts.events.appended[0]?.details).toMatchObject({ replaced: false, hashBefore: null });
  });

  it('takes If-Match: * as no version — a restore never overwrites blind', async () => {
    await setUp({ kind: 'file', bytes: now });

    await expect(restore({ ifMatch: '*' })).rejects.toBeInstanceOf(FileExistsError);
  });

  it('without If-Match, refuses a path taken since: 409 with what is there — S-340', async () => {
    await setUp({ kind: 'file', bytes: now });

    await expect(restore()).rejects.toMatchObject({
      code: 'FILE_EXISTS',
      params: { currentEtag: Etag.of(now).value },
    });
    expect(scene.calls).toEqual([]);
  });

  it('writes nothing the second time — the disk already holds it — S-342', async () => {
    await setUp({ kind: 'file', bytes: kept });

    expect(await restore()).toMatchObject({ written: false, history: null });
    expect(await restore({ ifMatch: Etag.of(now).value })).toMatchObject({ written: false });
    expect(scene.calls).toEqual([]);
    expect(parts.events.kinds).toEqual([]);
  });

  it('re-creates a folder, even empty, and takes one already there as done — S-344', async () => {
    const restored = await restore({ entryId: folderId });

    expect(restored).toMatchObject({ written: true, etag: null, size: null });
    expect(scene.calls).toEqual(['create:src:folder']);

    await setUp({ kind: 'directory', bytes: null });
    expect(await restore({ entryId: folderId, ifMatch: '"x"' })).toMatchObject({ written: false });
  });

  it('refuses a folder where a file is now: 409', async () => {
    await setUp({ kind: 'file', bytes: now });

    await expect(restore({ entryId: folderId })).rejects.toBeInstanceOf(FileExistsError);
  });

  it('writes nothing when the trail is down — file.restored goes first — S-343', async () => {
    parts.events.failure = new Error('database down');

    await expect(restore()).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(scene.calls).toEqual([]);
  });

  it.each([
    ['an id that is not there', 'NOPE', null],
    ['a version past the snapshot ceiling', 'BIG', 'tooLarge'],
    ['a version whose blob is gone', 'GONE', 'yes'],
  ])('answers 404 for %s — S-341', async (_, entryId, kind) => {
    if (kind !== null) {
      await parts.store.keep([
        {
          id: entryId,
          userId: owner,
          path: '/srv/app/big.bin',
          label: 'big.bin',
          reason: 'save',
          batchId: null,
          createdAt: new Date(0),
          contents:
            kind === 'tooLarge'
              ? { kind: 'tooLarge', hash: 'b'.repeat(64), sizeBytes: 9 }
              : { kind: 'file', read: () => Promise.resolve(Buffer.from('lost')) },
        },
      ]);
      parts.store.blobs.clear();
    }

    await expect(restore({ entryId })).rejects.toMatchObject({
      code: 'HISTORY_ENTRY_NOT_FOUND',
      params: { entryId },
    });
  });

  it('answers 404 for an entry outside the folder asked — S-341', async () => {
    const outside = new RestoreHistoryEntryUseCase(
      { ...parts.writing, folders: { resolve: () => Promise.resolve(HISTORY_FOLDER) } },
      parts.store,
      parts.keeper,
    );
    await parts.store.keep([
      {
        id: 'OTHER',
        userId: owner,
        path: '/srv/other/a.ts',
        label: 'a.ts',
        reason: 'save',
        batchId: null,
        createdAt: new Date(0),
        contents: { kind: 'file', read: () => Promise.resolve(kept) },
      },
    ]);

    await expect(
      outside.execute(
        { folder: HISTORY_FOLDER.value, entryId: 'OTHER', ifMatch: null, confirmSensitive: false },
        owner,
      ),
    ).rejects.toMatchObject({ code: 'HISTORY_ENTRY_NOT_FOUND' });
  });

  it('asks the second step of a file that changes what Claude may do — D-15', async () => {
    await parts.store.keep([
      {
        id: 'SETTINGS',
        userId: owner,
        path: '/srv/app/.mcp.json',
        label: '.mcp.json',
        reason: 'save',
        batchId: null,
        createdAt: new Date(0),
        contents: { kind: 'file', read: () => Promise.resolve(kept) },
      },
    ]);

    await expect(restore({ entryId: 'SETTINGS' })).rejects.toMatchObject({
      code: 'PRECONDITION_REQUIRED',
      params: { reason: 'sensitiveFile' },
    });
    expect(await restore({ entryId: 'SETTINGS', confirmSensitive: true })).toMatchObject({
      written: true,
    });
    expect(parts.events.appended[0]?.details).toMatchObject({ sensitive: true });
  });
});
