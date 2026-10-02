import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

import { undoDeletion } from '@/features/file-history';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';

const APP = '/srv/app';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('undoing a delete the history kept — plan 07, B-58, S-344', () => {
  it('restores every entry, folders first, goes on past a failure, and drops the cached history', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const taken = new AppError('FILE_EXISTS', 'files.error.exists', 't', { path: 'a.ts' });
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce({ path: 'src', etag: null, written: true })
      .mockRejectedValueOnce(taken)
      .mockRejectedValueOnce(new Error('network'));

    const results = await undoDeletion(
      client,
      APP,
      [
        { id: 'f', path: 'src/a.ts', entryKind: 'file' },
        { id: 'd', path: 'src', entryKind: 'directory' },
        { id: 'g', path: 'src/b.ts', entryKind: 'file' },
      ],
      true,
    );

    expect(post.mock.calls.map(([route]) => route)).toEqual([
      '/files/history/d/restore',
      '/files/history/f/restore',
      '/files/history/g/restore',
    ]);
    expect(post.mock.calls[0]?.[1]).toEqual({ folder: APP, confirmSensitive: true });
    expect(results).toEqual([
      { path: 'src', ok: true },
      { path: 'src/a.ts', ok: false, error: taken },
      {
        path: 'src/b.ts',
        ok: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }) as unknown,
      },
    ]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['fileHistory', APP] });
  });

  it('asks without the second step unless told', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ path: 'a.ts', etag: '"1"' });

    await undoDeletion(new QueryClient(), APP, [{ id: 'a', path: 'a.ts', entryKind: 'file' }]);

    expect(post).toHaveBeenCalledWith(
      '/files/history/a/restore',
      { folder: APP, confirmSensitive: false },
      {},
    );
  });
});
