import { beforeEach, describe, expect, it } from 'vitest';

import { ListHistoryUseCase, ReadHistoryContentUseCase } from '@application/files';
import type { FileHistoryStore, ListHistoryQuery } from '@application/files';
import { UserId } from '@domain/auth';
import { Etag, FileNotAFileError } from '@domain/files';
import type { HistoryReason } from '@domain/files';
import { IconvTextCodec } from '@adapter/outbound/files/iconv.text-codec';
import { HISTORY_FOLDER } from '../../../support/files/history-writing';
import { InMemoryFileHistory } from '../../../support/fakes/in-memory-file-history';
import { stubFolderDisk } from '../../../support/fakes/stub-folder-disk';

const owner = UserId.create('auth|42');
const folders = { resolve: () => Promise.resolve(HISTORY_FOLDER) };

/** Keeps one version of `path` — under the open folder unless it says otherwise. */
async function keep(
  store: InMemoryFileHistory,
  id: string,
  path: string,
  reason: HistoryReason = 'save',
  bytes: Buffer | null = Buffer.from(id),
) {
  await store.keep([
    {
      id,
      userId: owner,
      path,
      label: path.replace('/srv/app/', ''),
      reason,
      batchId: reason === 'delete' ? `B-${id}` : null,
      createdAt: new Date('2026-10-01T12:00:00.000Z'),
      contents:
        bytes === null
          ? { kind: 'directory' }
          : { kind: 'file', read: () => Promise.resolve(bytes) },
    },
  ]);
}

describe('ListHistoryUseCase — B-58', () => {
  let store: InMemoryFileHistory;
  const present = new Set<string>();
  const disk = stubFolderDisk({
    locate: (entry) => Promise.resolve(`/srv/app/${entry.relative}`),
    inspect: (entry) =>
      Promise.resolve(
        present.has(entry.relative) ? { kind: 'file', size: 1, identity: '1:1' } : null,
      ),
  });
  const list = (overrides: Partial<ListHistoryQuery> = {}, using: FileHistoryStore = store) =>
    new ListHistoryUseCase(folders, disk, using).execute(
      {
        folder: HISTORY_FOLDER.value,
        path: null,
        reason: null,
        deleted: false,
        cursor: null,
        limit: 2,
        ...overrides,
      },
      owner,
    );

  beforeEach(async () => {
    store = new InMemoryFileHistory();
    present.clear();
    await keep(store, 'A1', '/srv/app/a.ts');
    await keep(store, 'B1', '/srv/app/b.ts');
    await keep(store, 'A2', '/srv/app/a.ts', 'restore');
    await keep(store, 'A3', '/srv/app/a.ts');
  });

  it("lists one path's versions by its real path, newest first, a page at a time", async () => {
    const first = await list({ path: 'a.ts' });

    expect(first.entries.map((visible) => visible.entry.id)).toEqual(['A3', 'A2']);
    expect(first.entries[0]?.path.relative).toBe('a.ts');
    expect(first.nextCursor).toBe(String(first.entries[1]?.entry.seq));

    const second = await list({ path: 'a.ts', cursor: Number(first.nextCursor) });

    expect(second.entries.map((visible) => visible.entry.id)).toEqual(['A1']);
    expect(second.nextCursor).toBeNull();
  });

  it('lists everything under the folder, and filters by reason', async () => {
    expect((await list({ limit: 10 })).entries).toHaveLength(4);
    expect((await list({ reason: 'restore' })).entries.map((visible) => visible.entry.id)).toEqual([
      'A2',
    ]);
  });

  it('never hands out what the store found outside the folder', async () => {
    const leaky: FileHistoryStore = Object.assign(Object.create(store) as FileHistoryStore, {
      page: () =>
        store.page({
          scope: { kind: 'under', folder: '/srv' },
          reason: null,
          before: null,
          limit: 10,
        }),
    });
    await keep(store, 'X1', '/srv/other/x.ts');

    expect(
      (await list({ limit: 10 }, leaky)).entries.map((visible) => visible.entry.id),
    ).not.toContain('X1');
  });

  describe('the recently deleted', () => {
    beforeEach(async () => {
      store = new InMemoryFileHistory();
      await keep(store, 'D1', '/srv/app/one.ts', 'delete');
      await keep(store, 'D2', '/srv/app/two.ts', 'delete');
      await keep(store, 'D3', '/srv/app/back.ts', 'delete');
      await keep(store, 'D4', '/srv/app/one.ts', 'delete');
      await keep(store, 'D5', '/srv/app/three.ts', 'delete');
      present.add('back.ts');
    });

    it('is the latest delete of each path that is not there now, newest first', async () => {
      const first = await list({ deleted: true });

      expect(first.entries.map((visible) => visible.entry.id)).toEqual(['D5', 'D4']);
      expect(first.nextCursor).not.toBeNull();

      const second = await list({ deleted: true, cursor: Number(first.nextCursor) });

      // `back.ts` came back, so it is not "deleted" any more; `one.ts` shows its latest delete only.
      expect(second.entries.map((visible) => visible.entry.id)).toEqual(['D2']);
      expect(second.nextCursor).toBeNull();
    });

    it('is empty for a folder nothing was deleted from', async () => {
      store = new InMemoryFileHistory();

      expect(await list({ deleted: true })).toEqual({ entries: [], nextCursor: null });
    });
  });
});

describe('ReadHistoryContentUseCase — B-58', () => {
  let store: InMemoryFileHistory;
  const read = (entryId: string, encoding: string | null = null) =>
    new ReadHistoryContentUseCase(folders, store, new IconvTextCodec(), {
      largeFileBytes: 4,
    }).execute({ folder: HISTORY_FOLDER.value, entryId, encoding }, owner);

  beforeEach(async () => {
    store = new InMemoryFileHistory();
    await keep(store, 'TEXT', '/srv/app/a.ts', 'save', Buffer.from('hello\r\n'));
    await keep(store, 'DIR', '/srv/app/src', 'delete', null);
    await keep(store, 'OUT', '/srv/elsewhere/a.ts');
  });

  it('answers a version as opening a file does, decoded by the same rules', async () => {
    const opened = await read('TEXT');

    expect(opened).toMatchObject({
      kind: 'opened',
      content: 'hello\r\n',
      eol: 'crlf',
      encoding: 'utf8',
      etag: Etag.of(Buffer.from('hello\r\n')),
      size: 7,
      largeFile: true,
    });
    expect(opened.path.relative).toBe('a.ts');
  });

  it('refuses a folder of a delete: it has no text — 422', async () => {
    await expect(read('DIR')).rejects.toBeInstanceOf(FileNotAFileError);
  });

  it.each([['NOPE'], ['OUT']])('answers 404 for %s, never there or outside — S-341', async (id) => {
    await expect(read(id)).rejects.toMatchObject({ code: 'HISTORY_ENTRY_NOT_FOUND' });
  });

  it('answers 404 for a version whose blob the purge took', async () => {
    store.blobs.clear();

    await expect(read('TEXT')).rejects.toMatchObject({ code: 'HISTORY_ENTRY_NOT_FOUND' });
  });
});
