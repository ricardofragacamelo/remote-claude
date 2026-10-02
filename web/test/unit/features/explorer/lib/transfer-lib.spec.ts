import { describe, expect, it, vi } from 'vitest';

import { carriesDesktopFiles, readDrop, readPicked } from '@/features/explorer/lib/dropped-files';
import { chooseSaveTarget, saveByLink } from '@/features/explorer/lib/save-blob';
import { refusalError, transferError } from '@/features/explorer/lib/transfer-errors';
import {
  choicesOf,
  conflictsOf,
  levelsOf,
  planOf,
  progressOf,
  uploadRefusal,
} from '@/features/explorer/lib/upload-plan';
import type { FileLimits, UploadCandidate } from '@/features/explorer/types/transfer';
import { AppError } from '@/shared/api/errors';

vi.mock(
  '@/features/editor',
  async () => (await import('../../../../support/editor-fake')).editorFake,
);

const LIMITS: FileLimits = {
  maxEditBytes: 10,
  largeFileBytes: 5,
  downloadMaxBytes: 100,
  archiveMaxEntries: 10,
  uploadMaxBytes: 4,
  uploadMaxEntries: 3,
  uploadMaxTotalBytes: 8,
  historyMaxFileBytes: 10,
};

function candidate(path: string, content: string): UploadCandidate {
  return { file: new File([content], path.slice(path.lastIndexOf('/') + 1)), path };
}

describe('the plan of an upload — plan 07, B-52', () => {
  it('refuses, before anything is sent, a file, a count or a sum past its ceiling', () => {
    expect(uploadRefusal([candidate('a', '12345')], LIMITS)).toMatchObject({
      messageKey: 'explorer.transfer.fileTooLarge',
      measure: 'bytes',
      limit: 4,
      actual: 5,
      path: 'a',
    });
    expect(
      uploadRefusal(
        ['a', 'b', 'c', 'd'].map((name) => candidate(name, '1')),
        LIMITS,
      ),
    ).toMatchObject({
      messageKey: 'explorer.transfer.tooManyFiles',
      measure: 'entries',
      actual: 4,
    });
    expect(
      uploadRefusal(
        [candidate('a', '1234'), candidate('b', '12345'.slice(0, 4)), candidate('c', '1')],
        LIMITS,
      ),
    ).toMatchObject({ messageKey: 'explorer.transfer.uploadTooLarge', actual: 9, limit: 8 });
    expect(uploadRefusal([candidate('a', '1')], LIMITS)).toBeNull();
    expect(uploadRefusal([candidate('a', '123456789')], null)).toBeNull();
  });

  it('starts every conflict at "Skip", and a folder in the way cannot be replaced (S-319)', () => {
    const existing = new Map([
      ['a.md', { kind: 'file' as const, etag: '"a"' }],
      ['dir', { kind: 'directory' as const, etag: null }],
    ]);
    const conflicts = conflictsOf(
      [candidate('a.md', 'x'), candidate('dir', 'y'), candidate('n', 'z')],
      existing,
    );

    expect(conflicts.map((conflict) => [conflict.path, conflict.choice])).toEqual([
      ['a.md', 'skip'],
      ['dir', 'skip'],
    ]);
    expect(choicesOf({ kind: 'file', etag: null })).toEqual(['replace', 'keepBoth', 'skip']);
    expect(choicesOf({ kind: 'directory', etag: null })).toEqual(['keepBoth', 'skip']);
  });

  it('writes the manifest from the answers: replace with the version, keep both, skip left out, the rest refused if taken', () => {
    const files = [
      candidate('a', '1'),
      candidate('b', '2'),
      candidate('c', '3'),
      candidate('d', '4'),
      candidate('e', '5'),
    ];
    const plan = planOf(files, [
      { path: 'a', existing: { kind: 'file', etag: '"a"' }, choice: 'replace' },
      { path: 'b', existing: { kind: 'file', etag: '"b"' }, choice: 'keepBoth' },
      { path: 'c', existing: { kind: 'file', etag: '"c"' }, choice: 'skip' },
      { path: 'e', existing: { kind: 'file', etag: null }, choice: 'replace' },
    ]);

    expect(plan.manifest).toEqual([
      { path: 'a', size: 1, onConflict: 'replace', ifMatch: '"a"' },
      { path: 'b', size: 1, onConflict: 'keepBoth' },
      { path: 'd', size: 1, onConflict: 'fail' },
      { path: 'e', size: 1, onConflict: 'fail' },
    ]);
    expect(plan.files.map((file) => file.name)).toEqual(['a', 'b', 'd', 'e']);
  });

  it('fills the files one after the other with the bytes sent (S-318)', () => {
    const files = (...sizes: number[]) =>
      sizes.map((size, index) => ({ path: String(index), size }));
    const fractions = (sizes: number[], loaded: number, total: number) =>
      progressOf(files(...sizes), loaded, total).map((each) => each.progress);

    expect(fractions([10, 0, 10], 0, 0)).toEqual([0, 0, 0]);
    expect(fractions([10, 0, 10], 5, 20)).toEqual([0.5, 0, 0]);
    expect(fractions([10, 0, 10], 15, 20)).toEqual([1, 1, 0.5]);
    expect(fractions([10, 10], 40, 20)).toEqual([1, 1]);
    expect(progressOf(files(1), 1, 1)).toEqual([{ path: '0', progress: 1 }]);
  });

  it('reads again the levels an upload touched — the destination, and every folder it made', () => {
    expect(levelsOf('docs', ['a.md', 'img/x/y.png', 'img/z.png'])).toEqual([
      'docs',
      'docs/img',
      'docs/img/x',
    ]);
    expect(levelsOf('', ['p/q.txt'])).toEqual(['', 'p']);
  });
});

describe('the words of a ceiling — plan 07, S-321', () => {
  it('says a ceiling refused here in the person’s units', () => {
    const error = refusalError(
      {
        messageKey: 'explorer.transfer.tooManyFiles',
        measure: 'entries',
        limit: 1000,
        actual: 1200,
        path: null,
      },
      'en',
    );

    expect(error).toMatchObject({
      code: 'FILE_TOO_LARGE',
      params: { limit: '1,000', size: '1,200' },
    });
    expect(
      refusalError(
        { messageKey: 'k', measure: 'bytes', limit: 2_000_000, actual: 1, path: 'a' },
        'en',
      ).params,
    ).toEqual({
      limit: '2 MB',
      size: '1 byte',
    });
  });

  it('says the server’s ceiling of a transfer in the words of a transfer, and leaves any other refusal as it came', () => {
    const tooLarge = (params: Record<string, unknown>) =>
      new AppError('FILE_TOO_LARGE', 'files.error.tooLarge', 'trace-1', params);

    expect(
      transferError(tooLarge({ measure: 'entries', limit: 10 }), 'download', 'en'),
    ).toMatchObject({
      messageKey: 'explorer.transfer.archiveTooManyEntries',
      traceId: 'trace-1',
      params: { limit: '10', size: '0' },
    });
    expect(transferError(tooLarge({ limit: 1_000 }), 'download', 'en').messageKey).toBe(
      'explorer.transfer.downloadTooLarge',
    );
    expect(transferError(tooLarge({ measure: 'entries' }), 'upload', 'en').messageKey).toBe(
      'explorer.transfer.tooManyFiles',
    );
    const other = new AppError('FILE_NOT_FOUND', 'files.error.notFound', 't');
    expect(transferError(other, 'upload', 'en')).toBe(other);
  });
});

describe('what the person hands over — plan 07, B-52', () => {
  it('takes picked files by their names, and a picked folder by its paths', () => {
    const plain = new File(['a'], 'a.txt');
    const inFolder = new File(['b'], 'b.txt');
    Object.defineProperty(inFolder, 'webkitRelativePath', { value: 'pack/b.txt' });
    const empty = new File(['c'], 'c.txt');
    Object.defineProperty(empty, 'webkitRelativePath', { value: '' });

    expect(readPicked([plain, inFolder, empty]).map((each) => each.path)).toEqual([
      'a.txt',
      'pack/b.txt',
      'c.txt',
    ]);
  });

  it('reads the plain files of a drop where the browser has no entries API, and nothing that is not a file', async () => {
    const file = new File(['x'], 'x.txt');
    const drop = {
      items: [{ kind: 'string' }, { kind: 'file' }],
      files: [file],
      types: ['Files'],
    } as unknown as DataTransfer;

    expect((await readDrop(drop)).map((each) => each.path)).toEqual(['x.txt']);
    expect(carriesDesktopFiles(drop)).toBe(true);
    expect(carriesDesktopFiles({ types: ['text/plain'] } as unknown as DataTransfer)).toBe(false);
  });

  it('leaves out an entry of a drop that is neither a file nor a folder', async () => {
    const odd = { isFile: false, isDirectory: false, fullPath: '/odd' };
    const drop = {
      items: [{ kind: 'file', webkitGetAsEntry: () => odd }],
      files: [],
      types: ['Files'],
    } as unknown as DataTransfer;

    expect(await readDrop(drop)).toEqual([]);
  });
});

describe('where a download goes — plan 07 · D-16', () => {
  it('has no target where the browser has no save dialog', async () => {
    expect(await chooseSaveTarget('a.txt', {})).toBeNull();
  });

  it('saves by a link to a blob the page made, and lets it go', () => {
    vi.useFakeTimers();
    const urls = { made: '', revoked: '' };
    Object.defineProperty(URL, 'createObjectURL', {
      value: () => {
        urls.made = 'blob:http://localhost/1';
        return urls.made;
      },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: (url: string) => {
        urls.revoked = url;
      },
      configurable: true,
      writable: true,
    });
    const clicked: HTMLAnchorElement[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function c(
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });

    saveByLink(new Blob(['x']), 'a.txt');
    expect(clicked[0]?.download).toBe('a.txt');
    expect(clicked[0]?.getAttribute('href')).toBe('blob:http://localhost/1');
    expect(clicked[0]?.isConnected).toBe(false);
    vi.runAllTimers();
    expect(urls.revoked).toBe('blob:http://localhost/1');

    click.mockRestore();
    vi.useRealTimers();
  });
});
