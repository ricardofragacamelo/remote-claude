import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  copyEntry,
  createEntry,
  deleteEntry,
  deleteKeepingHistory,
  fetchDirectory,
  moveEntry,
  readFileText,
} from '@/features/explorer/services/explorer.service';
import { api } from '@/shared/api/api';

const APP = '/srv/app';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the explorer service — the files routes (07 · D-11)', () => {
  it('reads one level, naming the folder and the path in the query', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      folder: APP,
      path: 'src',
      entries: [],
      truncated: true,
    });

    expect(await fetchDirectory(APP, 'src')).toEqual({ path: 'src', entries: [], truncated: true });
    expect(get).toHaveBeenCalledWith('/files/tree?folder=%2Fsrv%2Fapp&path=src');
  });

  it('reads the text of a file', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ content: 'hello', etag: '"1"' });

    expect(await readFileText(APP, 'a b.ts')).toBe('hello');
    expect(get).toHaveBeenCalledWith('/files/content?folder=%2Fsrv%2Fapp&path=a+b.ts');
  });

  it('creates a file with what it starts with, and a folder with nothing', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ path: 'a.ts', etag: '"1"' });

    await createEntry(APP, 'a.ts', 'file', { content: 'x' });
    await createEntry(APP, 'b.ts', 'file');
    await createEntry(APP, 'lib', 'directory', { confirmSensitive: true });

    expect(post.mock.calls).toEqual([
      [
        '/files',
        { folder: APP, path: 'a.ts', kind: 'file', content: 'x', confirmSensitive: false },
      ],
      ['/files', { folder: APP, path: 'b.ts', kind: 'file', content: '', confirmSensitive: false }],
      ['/files', { folder: APP, path: 'lib', kind: 'directory', confirmSensitive: true }],
    ]);
  });

  it('moves and copies, with the version when there is one', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ path: 'b', etag: null });

    await moveEntry(APP, 'a', 'b', { ifMatch: '"1"' });
    await copyEntry(APP, 'a', 'b');
    await moveEntry(APP, 'a', 'b', { ifMatch: null, confirmSensitive: true });

    expect(post.mock.calls).toEqual([
      ['/files/move', { folder: APP, from: 'a', to: 'b', ifMatch: '"1"', confirmSensitive: false }],
      ['/files/copy', { folder: APP, from: 'a', to: 'b', confirmSensitive: false }],
      ['/files/move', { folder: APP, from: 'a', to: 'b', confirmSensitive: true }],
    ]);
  });

  it('deletes — recursive only with the count, the version in If-Match', async () => {
    const remove = vi.spyOn(api, 'delete').mockResolvedValue(undefined);

    await deleteEntry(APP, 'a.ts');
    await deleteEntry(APP, 'full', { expectedEntries: 3, confirmSensitive: true });
    await deleteEntry(APP, 'b.ts', { ifMatch: '"2"' });

    expect(remove.mock.calls).toEqual([
      ['/files?folder=%2Fsrv%2Fapp&path=a.ts', {}],
      [
        '/files?folder=%2Fsrv%2Fapp&path=full&recursive=true&expectedEntries=3&confirmSensitive=true',
        {},
      ],
      ['/files?folder=%2Fsrv%2Fapp&path=b.ts', { headers: { 'if-match': '"2"' } }],
    ]);
  });

  it('deletes keeping what goes in the local history, and answers what it kept — plan 07, B-58', async () => {
    const kept = { batchId: 'b-1', entries: [{ id: 'h-1', path: 'a.ts', entryKind: 'file' }] };
    const remove = vi.spyOn(api, 'delete').mockResolvedValue({ kept });

    await expect(deleteKeepingHistory(APP, 'a.ts')).resolves.toEqual(kept);
    await deleteKeepingHistory(APP, '.mcp.json', { confirmSensitive: true });

    expect(remove.mock.calls).toEqual([
      ['/files?folder=%2Fsrv%2Fapp&path=a.ts&keepInHistory=true'],
      ['/files?folder=%2Fsrv%2Fapp&path=.mcp.json&keepInHistory=true&confirmSensitive=true'],
    ]);
  });
});
