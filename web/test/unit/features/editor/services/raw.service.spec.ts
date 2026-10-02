import { afterEach, describe, expect, it, vi } from 'vitest';

import { readPage, readRaw } from '@/features/editor/services/raw.service';
import { api } from '@/shared/api/api';
import type { BytesResponse } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';

afterEach(() => {
  vi.restoreAllMocks();
});

function answer(status: number, body: string, headers: Record<string, string> = {}): BytesResponse {
  return { status, blob: new Blob([body]), header: (name) => headers[name] ?? null };
}

/** Bytes as the text they spell — the realms of jsdom make two arrays of one content unequal. */
function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

const page = { folder: '/srv/app', path: 'a.bin', start: 4, length: 4, ifMatch: null };

describe('the bytes of a file — plan 07 · F7', () => {
  it('reads a whole file for a preview, by the folder and the path in the query, with the signal', async () => {
    const bytes = vi.spyOn(api, 'bytes').mockResolvedValue(answer(200, 'png', { etag: '"v"' }));
    const signal = new AbortController().signal;

    const file = await readRaw('/srv/app', 'img/a.png', signal);

    expect(bytes).toHaveBeenCalledWith('/files/raw?folder=%2Fsrv%2Fapp&path=img%2Fa.png', {
      signal,
    });
    expect(await file.blob.text()).toBe('png');
    expect(file.etag).toBe('"v"');

    await readRaw('/srv/app', 'b.png');
    expect(bytes).toHaveBeenLastCalledWith('/files/raw?folder=%2Fsrv%2Fapp&path=b.png', {});
  });

  it('reads a page by Range, naming the version from the second page on (S-317)', async () => {
    const bytes = vi
      .spyOn(api, 'bytes')
      .mockResolvedValue(answer(206, 'efgh', { etag: '"v1"', 'content-range': 'bytes 4-7/20' }));

    const read = await readPage(page);
    expect({ ...read, bytes: text(read.bytes) }).toEqual({
      bytes: 'efgh',
      etag: '"v1"',
      size: 20,
      start: 4,
    });
    expect(bytes.mock.calls[0]?.[1]).toEqual({ headers: { range: 'bytes=4-7' } });

    const signal = new AbortController().signal;
    await readPage({ ...page, ifMatch: '"v1"', signal });
    expect(bytes.mock.calls[1]?.[1]).toEqual({
      headers: { range: 'bytes=4-7', 'if-match': '"v1"' },
      signal,
    });
  });

  it('takes the page from a whole body, when the server answered 200', async () => {
    vi.spyOn(api, 'bytes').mockResolvedValue(answer(200, 'abcdefghij'));

    const read = await readPage(page);
    expect({ ...read, bytes: text(read.bytes) }).toMatchObject({
      bytes: 'efgh',
      size: 10,
      etag: null,
    });
  });

  it('falls back to what arrived when the size is not said', async () => {
    vi.spyOn(api, 'bytes').mockResolvedValue(answer(206, 'ef', { 'content-range': 'bytes 4-5/*' }));

    expect((await readPage(page)).size).toBe(2);
  });

  it('is the empty page for a file of zero bytes (S-315), and any other refusal as it came', async () => {
    const empty = new AppError('RANGE_NOT_SATISFIABLE', 'files.error.rangeNotSatisfiable', 't', {
      size: 0,
    });
    const bytes = vi.spyOn(api, 'bytes').mockRejectedValueOnce(empty);

    const read = await readPage({ ...page, start: 0 });
    expect({ ...read, bytes: text(read.bytes) }).toEqual({
      bytes: '',
      etag: null,
      size: 0,
      start: 0,
    });

    bytes.mockRejectedValueOnce(new AppError('RANGE_NOT_SATISFIABLE', 'k', 't'));
    expect((await readPage({ ...page, start: 0 })).size).toBe(0);

    bytes.mockRejectedValueOnce(empty);
    await expect(readPage(page)).rejects.toBe(empty);
  });
});
