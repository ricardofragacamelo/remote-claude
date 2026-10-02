import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchCurrentVersion,
  fetchDeleted,
  fetchHistoryLimits,
  fetchVersions,
  restoreVersion,
} from '@/features/file-history/services/history.service';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';

const APP = '/srv/app';

afterEach(() => {
  vi.restoreAllMocks();
});

const entryDto = {
  id: 'h-1',
  path: 'a.ts',
  entryKind: 'file',
  reason: 'save',
  kept: 'yes',
  sizeBytes: 3,
  hash: 'sha',
  author: { self: true, id: 'me', extra: 'dropped' },
  at: '2026-10-01T10:00:00.000Z',
  batchId: null,
  extra: 'dropped',
};

describe('the local history service — plan 07, B-59', () => {
  it('asks for the versions of a path, filtered and after a cursor, and maps them to the model', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ entries: [entryDto], nextCursor: 'c-2' });

    const page = await fetchVersions(APP, 'src/a b.ts', 'delete', 'c-1');

    expect(get).toHaveBeenCalledWith(
      '/files/history?folder=%2Fsrv%2Fapp&path=src%2Fa+b.ts&reason=delete&cursor=c-1&limit=20',
    );
    expect(page).toEqual({
      entries: [
        {
          id: 'h-1',
          path: 'a.ts',
          entryKind: 'file',
          reason: 'save',
          kept: 'yes',
          sizeBytes: 3,
          author: { self: true, id: 'me' },
          at: '2026-10-01T10:00:00.000Z',
          batchId: null,
        },
      ],
      nextCursor: 'c-2',
    });
  });

  it('leaves out the reason and the cursor it was not given', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ entries: [], nextCursor: null });

    await fetchVersions(APP, 'a.ts', null, null);

    expect(get).toHaveBeenCalledWith('/files/history?folder=%2Fsrv%2Fapp&path=a.ts&limit=20');
  });

  it('asks for what was deleted recently', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ entries: [], nextCursor: null });

    await expect(fetchDeleted(APP, null)).resolves.toEqual({ entries: [], nextCursor: null });
    await fetchDeleted(APP, '20');

    expect(get).toHaveBeenNthCalledWith(
      1,
      '/files/history?folder=%2Fsrv%2Fapp&deleted=true&limit=20',
    );
    expect(get).toHaveBeenNthCalledWith(
      2,
      '/files/history?folder=%2Fsrv%2Fapp&deleted=true&cursor=20&limit=20',
    );
  });

  it('restores over the version named in If-Match, or recreates without one', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ path: 'a.ts', etag: '"2"', size: 1, written: true, history: null });

    await expect(restoreVersion(APP, 'h/1', { ifMatch: '"1"' })).resolves.toEqual({
      path: 'a.ts',
      etag: '"2"',
      written: true,
    });
    await restoreVersion(APP, 'h-2', { ifMatch: null, confirmSensitive: true });
    await restoreVersion(APP, 'h-3');

    expect(post).toHaveBeenNthCalledWith(
      1,
      '/files/history/h%2F1/restore',
      { folder: APP, confirmSensitive: false },
      { headers: { 'if-match': '"1"' } },
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/files/history/h-2/restore',
      { folder: APP, confirmSensitive: true },
      {},
    );
    expect(post).toHaveBeenNthCalledWith(
      3,
      '/files/history/h-3/restore',
      { folder: APP, confirmSensitive: false },
      {},
    );
  });

  it('reads the version on disk of a file, none for one that is not there, and lets the rest through', async () => {
    const refusal = new AppError('FILE_NOT_TEXT', 'files.error.notText', 't');
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce({ etag: '"9"', content: 'x' })
      .mockRejectedValueOnce(new AppError('FILE_NOT_FOUND', 'files.error.notFound', 't'))
      .mockRejectedValueOnce(refusal)
      .mockRejectedValueOnce(new Error('network'));

    await expect(fetchCurrentVersion(APP, 'a.ts')).resolves.toBe('"9"');
    await expect(fetchCurrentVersion(APP, 'a.ts')).resolves.toBeNull();
    await expect(fetchCurrentVersion(APP, 'a.ts')).rejects.toBe(refusal);
    await expect(fetchCurrentVersion(APP, 'a.ts')).rejects.toThrow('network');
    expect(get).toHaveBeenCalledWith('/files/content?folder=%2Fsrv%2Fapp&path=a.ts');
  });

  it('reads the ceiling of a version from the limits of the installation', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ maxEditBytes: 1, historyMaxFileBytes: 2048 });

    await expect(fetchHistoryLimits()).resolves.toEqual({ historyMaxFileBytes: 2048 });
  });
});
