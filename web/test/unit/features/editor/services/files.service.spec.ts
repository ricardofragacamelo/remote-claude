import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createFile,
  listDirectory,
  readFile,
  readVersion,
  saveFile,
} from '@/features/editor/services/files.service';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';

afterEach(() => {
  vi.restoreAllMocks();
});

const content = {
  path: 'src/a.ts',
  content: 'x',
  etag: '"v1"',
  encoding: 'utf8',
  bom: false,
  eol: 'crlf',
  size: 1,
  mtime: '2026-10-01T00:00:00.000Z',
  largeFile: true,
};

const write = {
  folder: '/srv/app',
  path: 'src/a.ts',
  content: 'y',
  encoding: 'utf8',
  bom: false,
  confirmSensitive: false,
};

describe('reading a file', () => {
  it('asks for the folder and the path, and maps what came back', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(content);

    await expect(readFile('/srv/app', 'src/a.ts')).resolves.toEqual({
      kind: 'read',
      file: {
        path: 'src/a.ts',
        content: 'x',
        etag: '"v1"',
        format: { encoding: 'utf8', bom: false, eol: 'crlf' },
        size: 1,
        largeFile: true,
      },
    });
    expect(get).toHaveBeenCalledWith('/files/content?folder=%2Fsrv%2Fapp&path=src%2Fa.ts', {});
  });

  it('asks with an encoding and the version on screen — and a 304 is "still that one"', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(undefined);

    await expect(
      readFile('/srv/app', 'a.txt', { encoding: 'windows1252', ifNoneMatch: '"v1"' }),
    ).resolves.toEqual({ kind: 'notModified' });
    expect(get).toHaveBeenCalledWith(
      '/files/content?folder=%2Fsrv%2Fapp&path=a.txt&encoding=windows1252',
      { headers: { 'if-none-match': '"v1"' } },
    );
  });
});

describe('saving a file — plan 07, S-231', () => {
  it('always names the version it overwrites, in If-Match', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({ path: 'src/a.ts', etag: '"v2"', size: 1 });

    await expect(saveFile({ ...write, etag: '"v1"' })).resolves.toEqual({
      path: 'src/a.ts',
      etag: '"v2"',
      historyNotKept: null,
    });
    expect(put).toHaveBeenCalledWith(
      '/files/content',
      { ...write },
      { headers: { 'if-match': '"v1"' } },
    );
  });

  it.each([
    [{ kept: true, entryId: 'h-1' }, null],
    [{ kept: false, reason: 'tooLarge' }, 'tooLarge'],
    [{ kept: false, reason: 'unavailable' }, 'unavailable'],
    [null, null],
  ] as const)(
    'says whether the version it replaced stayed out of the local history (%j) — plan 07, S-336',
    async (history, notKept) => {
      vi.spyOn(api, 'put').mockResolvedValue({ path: 'src/a.ts', etag: '"v2"', history });

      await expect(saveFile({ ...write, etag: '"v1"' })).resolves.toMatchObject({
        historyNotKept: notKept,
      });
    },
  );

  it('reads a version the local history kept, by its entry — plan 07, B-59', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ path: 'src/a.ts', content: 'old' });

    await expect(readVersion('/srv/app', 'h/1')).resolves.toBe('old');
    expect(get).toHaveBeenCalledWith('/files/history/h%2F1/content?folder=%2Fsrv%2Fapp');
  });

  it.each(['', '  ', '*'])(
    'never sends a save without a version (%j) — nothing leaves',
    async (etag) => {
      const put = vi.spyOn(api, 'put');

      await expect(saveFile({ ...write, etag })).rejects.toMatchObject({
        code: 'PRECONDITION_REQUIRED',
        params: { reason: 'ifMatchMissing', path: 'src/a.ts' },
      });
      expect(put).not.toHaveBeenCalled();
    },
  );

  it('keeps the version it named when the server says none — and lets a refusal through', async () => {
    vi.spyOn(api, 'put')
      .mockResolvedValueOnce({ path: 'src/a.ts', etag: null })
      .mockRejectedValueOnce(
        new AppError('FILE_CHANGED', 'files.error.changed', 't', { currentEtag: '"v9"' }),
      );

    await expect(saveFile({ ...write, etag: '"v1"' })).resolves.toEqual({
      path: 'src/a.ts',
      etag: '"v1"',
      historyNotKept: null,
    });
    await expect(saveFile({ ...write, etag: '"v1"' })).rejects.toMatchObject({
      code: 'FILE_CHANGED',
    });
  });
});

describe('creating a file', () => {
  it('posts a file with its text, never over anything', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce({ path: 'b.ts', etag: '"v1"' })
      .mockResolvedValueOnce({ path: 'b.ts', etag: null });

    await expect(createFile({ ...write, path: 'b.ts' })).resolves.toEqual({
      path: 'b.ts',
      etag: '"v1"',
    });
    await expect(createFile({ ...write, path: 'b.ts' })).resolves.toEqual({
      path: 'b.ts',
      etag: '',
    });
    expect(post).toHaveBeenCalledWith('/files', { ...write, path: 'b.ts', kind: 'file' });
  });
});

describe('listing a directory for the trail', () => {
  it('keeps the files and directories a person can open, links followed inside', async () => {
    const entry = { hidden: false, unreadableName: false, outside: false, targetKind: null };
    vi.spyOn(api, 'get').mockResolvedValue({
      truncated: false,
      entries: [
        { ...entry, name: 'src', path: 'src', kind: 'directory' },
        { ...entry, name: 'a.ts', path: 'a.ts', kind: 'file' },
        { ...entry, name: 'in', path: 'in', kind: 'symlink', targetKind: 'directory' },
        { ...entry, name: 'out', path: 'out', kind: 'symlink', outside: true },
        { ...entry, name: '�', path: 'x', kind: 'file', unreadableName: true },
        { ...entry, name: 'fifo', path: 'fifo', kind: 'other' },
        { ...entry, name: 'gone', path: 'gone', kind: 'symlink', targetKind: 'missing' },
      ],
    });

    await expect(listDirectory('/srv/app', '')).resolves.toEqual([
      { name: 'src', path: 'src', kind: 'directory' },
      { name: 'a.ts', path: 'a.ts', kind: 'file' },
      { name: 'in', path: 'in', kind: 'directory' },
    ]);
  });
});
