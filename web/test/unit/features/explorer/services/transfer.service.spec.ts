import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  downloadArchive,
  downloadFile,
  fetchLimits,
  nameOfDisposition,
  preflightUpload,
  uploadFiles,
} from '@/features/explorer/services/transfer.service';
import { api } from '@/shared/api/api';
import type { BytesResponse } from '@/shared/api/api';

afterEach(() => {
  vi.restoreAllMocks();
});

function answer(disposition: string | null): BytesResponse {
  return { status: 200, blob: new Blob(['x']), header: () => disposition };
}

describe('files in and out of the machine — plan 07, B-52', () => {
  it('reads the ceilings', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ downloadMaxBytes: 1 });

    expect(await fetchLimits()).toEqual({ downloadMaxBytes: 1 });
    expect(get).toHaveBeenCalledWith('/files/limits');
  });

  it.each([
    ["attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf", 'résumé.pdf'],
    ['attachment; filename="plain name.zip"', 'plain name.zip'],
    ['attachment; filename=bare.txt', 'bare.txt'],
    ['attachment; filename*=UTF-8\'\'%E0%A4%A; filename="fallback.txt"', 'fallback.txt'],
    ['inline', null],
    [null, null],
  ])('reads the name of %j as %j', (disposition, name) => {
    expect(nameOfDisposition(disposition)).toBe(name);
  });

  it('downloads a file with download=true, by the name the server gave — or the one it had (S-320)', async () => {
    const bytes = vi
      .spyOn(api, 'bytes')
      .mockResolvedValueOnce(answer('attachment; filename="served.txt"'))
      .mockResolvedValueOnce(answer(null));
    const signal = new AbortController().signal;

    expect((await downloadFile('/srv/app', 'src/a.ts', 'a.ts', signal)).name).toBe('served.txt');
    expect(bytes).toHaveBeenCalledWith(
      '/files/raw?folder=%2Fsrv%2Fapp&path=src%2Fa.ts&download=true',
      { signal },
    );
    expect((await downloadFile('/srv/app', 'src/a.ts', 'a.ts')).name).toBe('a.ts');
    expect(bytes).toHaveBeenLastCalledWith(expect.any(String), {});
  });

  it('downloads the selection as one zip, a path for each entry (S-359)', async () => {
    const bytes = vi.spyOn(api, 'bytes').mockResolvedValue(answer(null));
    const signal = new AbortController().signal;

    const zip = await downloadArchive('/srv/app', ['a.ts', 'src', 'b c.md'], 'app.zip', signal);

    expect(zip.name).toBe('app.zip');
    expect(bytes).toHaveBeenCalledWith(
      '/files/archive?folder=%2Fsrv%2Fapp&path=a.ts&path=src&path=b+c.md',
      { signal },
    );
    await downloadArchive('/srv/app', ['a.ts'], 'a.zip');
    expect(bytes).toHaveBeenLastCalledWith(expect.any(String), {});
  });

  it('asks the preflight what each file would land on, before sending (S-319)', async () => {
    // The server answers paths relative to the open folder.
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      items: [
        { path: 'docs/a.md', existing: { kind: 'file', etag: '"1"' } },
        { path: 'docs/b.md', existing: null },
      ],
    });

    const existing = await preflightUpload('/srv/app', 'docs', [
      { path: 'a.md', size: 1 },
      { path: 'b.md', size: 2 },
    ]);

    expect(post).toHaveBeenCalledWith('/files/upload/preflight', {
      folder: '/srv/app',
      directory: 'docs',
      items: [
        { path: 'a.md', size: 1 },
        { path: 'b.md', size: 2 },
      ],
    });
    expect([...existing]).toEqual([['a.md', { kind: 'file', etag: '"1"' }]]);

    post.mockResolvedValueOnce({
      items: [{ path: 'top.md', existing: { kind: 'file', etag: null } }],
    });
    const atTop = await preflightUpload('/srv/app', '', [{ path: 'top.md', size: 1 }]);
    expect([...atTop.keys()]).toEqual(['top.md']);
  });

  it('sends the fields first and then the files in the order of the manifest, and maps each result', async () => {
    const upload = vi.spyOn(api, 'upload').mockResolvedValue({
      status: 207,
      body: {
        items: [
          { path: 'a.md', status: 'created', etag: '"a"' },
          { path: 'b.md', status: 'renamed', etag: '"b"' },
          {
            path: 'r.md',
            status: 'replaced',
            etag: '"r"',
            history: { kept: false, reason: 'tooLarge' },
          },
          {
            path: 'c.md',
            status: 'failed',
            error: {
              code: 'FILE_EXISTS',
              messageKey: 'files.error.exists',
              params: { path: 'c.md' },
            },
          },
        ],
      },
    });
    const signal = new AbortController().signal;
    const onProgress = vi.fn();
    const manifest = [
      { path: 'a.md', size: 1, onConflict: 'fail' },
      { path: 'b.md', size: 1, onConflict: 'keepBoth' },
      { path: 'c.md', size: 1, onConflict: 'fail' },
    ] as const;

    const items = await uploadFiles({
      folder: '/srv/app',
      directory: 'docs',
      manifest,
      files: [new File(['a'], 'a.md'), new File(['b'], 'b.md'), new File(['c'], 'c.md')],
      confirmSensitive: true,
      signal,
      onProgress,
    });

    const [route, form, options] = upload.mock.calls[0] as unknown as [string, FormData, object];
    expect(route).toBe('/files/upload');
    expect([...form.keys()]).toEqual([
      'folder',
      'directory',
      'manifest',
      'confirmSensitive',
      'file',
      'file',
      'file',
    ]);
    expect(JSON.parse(String(form.get('manifest')))).toEqual(manifest);
    expect(form.get('confirmSensitive')).toBe('true');
    expect(options).toEqual({ signal, onProgress });
    expect(items[0]).toEqual({ path: 'a.md', status: 'created', etag: '"a"' });
    expect(items[1]).toEqual({ path: 'b.md', status: 'renamed', etag: '"b"' });
    expect(items[2]).toEqual({
      path: 'r.md',
      status: 'replaced',
      etag: '"r"',
      history: { kept: false, reason: 'tooLarge' },
    });
    expect(items[3]).toMatchObject({
      path: 'c.md',
      status: 'failed',
      error: { code: 'FILE_EXISTS' },
    });

    await uploadFiles({
      folder: '/f',
      directory: '',
      manifest: [],
      files: [],
      confirmSensitive: false,
    });
    expect(upload.mock.calls[1]?.[2]).toEqual({});
  });
});
