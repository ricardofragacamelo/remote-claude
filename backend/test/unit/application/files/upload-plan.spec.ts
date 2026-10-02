import { describe, expect, it } from 'vitest';

import { PreflightUploadUseCase, ReadLimitsUseCase } from '@application/files';
import type { EntryInspection, FolderDisk } from '@application/files';
import { UserId } from '@domain/auth';
import { Etag, FileNotFoundError, InvalidFilePathError } from '@domain/files';
import type { FilePath } from '@domain/files';
import { WorkspaceNotADirectoryError, WorkspaceNotAllowedError } from '@domain/workspace';
import { stubFolderDisk } from '../../../support/fakes/stub-folder-disk';
import { WRITING_FOLDER } from '../../../support/files/file-writing';

const owner = UserId.create('auth|42');
const LIMITS = {
  downloadMaxBytes: 1000,
  archiveMaxEntries: 10,
  uploadMaxBytes: 100,
  uploadMaxEntries: 3,
  uploadMaxTotalBytes: 150,
};

/** A disk where only `entries` exist — by path relative to the open folder. */
function diskWith(entries: Readonly<Record<string, EntryInspection['kind']>>): FolderDisk {
  const at = (entry: FilePath): EntryInspection | null => {
    const kind = entries[entry.relative];
    return kind === undefined ? null : { kind, size: 1, identity: `1:${entry.relative}` };
  };

  return stubFolderDisk({
    inspect: (entry) => Promise.resolve(at(entry)),
    version: (entry) =>
      Promise.resolve(at(entry)?.kind === 'file' ? Etag.of(Buffer.from(entry.relative)) : null),
  });
}

const preflight = (disk: FolderDisk = diskWith({ '': 'directory' })): PreflightUploadUseCase =>
  new PreflightUploadUseCase({ resolve: () => Promise.resolve(WRITING_FOLDER) }, disk, LIMITS);

const run = (
  items: readonly { path: string; size: number }[],
  directory = '',
  disk?: FolderDisk,
): ReturnType<PreflightUploadUseCase['execute']> =>
  preflight(disk).execute({ folder: WRITING_FOLDER.value, directory, items }, owner);

/**
 * What an upload is checked for before its first byte, as the preflight asks it — plan 07, B-49.
 * The upload runs the very same plan; its own spec covers what only it does.
 */
describe('the plan of an upload, through the preflight', () => {
  it('says what is already where each item would go — S-319 backend half', async () => {
    const disk = diskWith({
      '': 'directory',
      docs: 'directory',
      'docs/a.md': 'file',
      'docs/sub': 'directory',
    });

    const items = await run(
      [
        { path: 'a.md', size: 1 },
        { path: 'b.md', size: 1 },
        { path: 'sub', size: 1 },
      ],
      'docs',
      disk,
    );

    expect(items.map((item) => [item.path.relative, item.existing])).toEqual([
      ['docs/a.md', { kind: 'file', etag: Etag.of(Buffer.from('docs/a.md')) }],
      ['docs/b.md', null],
      ['docs/sub', { kind: 'directory', etag: null }],
    ]);
  });

  it('reports every reason of every item at once — S-306, S-357', async () => {
    const refusal = await run([
      { path: '../x', size: 1 },
      { path: 'ok.txt', size: 1 },
      { path: '/abs', size: 1 },
    ]).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(InvalidFilePathError);
    expect((refusal as InvalidFilePathError).details).toEqual([
      { field: 'items.0.path', rule: 'mustNotClimb' },
      { field: 'items.2.path', rule: 'mustBeRelative' },
    ]);
  });

  it('refuses two items onto one name', async () => {
    const refusal = await run([
      { path: 'a.txt', size: 1 },
      { path: 'b.txt', size: 1 },
      { path: 'a.txt', size: 1 },
    ]).catch((error: unknown) => error);

    expect((refusal as InvalidFilePathError).details).toEqual([
      { field: 'items.2.path', rule: 'mustBeUnique' },
    ]);
  });

  it('refuses a directory that climbs out of the open folder — S-306', async () => {
    await expect(run([{ path: 'a.txt', size: 1 }], '../outside')).rejects.toBeInstanceOf(
      WorkspaceNotAllowedError,
    );
  });

  it.each([
    ['too many items', [1, 1, 1, 1], { size: 4, limit: 3, measure: 'entries', path: '' }],
    [
      'one file past its ceiling',
      [100, 101],
      { size: 101, limit: 100, measure: 'bytes', path: 'f1' },
    ],
    ['the sum past its ceiling', [100, 51], { size: 151, limit: 150, measure: 'bytes', path: '' }],
  ])('refuses %s before anything — S-304, S-358', async (_name, sizes, params) => {
    const items = sizes.map((size, index) => ({ path: `f${String(index)}`, size }));

    await expect(run(items)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE', params });
  });

  it('accepts exactly the ceilings — fron', async () => {
    await expect(
      run([
        { path: 'a', size: 100 },
        { path: 'b', size: 50 },
        { path: 'c', size: 0 },
      ]),
    ).resolves.toHaveLength(3);
  });

  it('needs the directory to be there, and to be a folder', async () => {
    const disk = diskWith({ '': 'directory', 'a.txt': 'file', pipe: 'other', link: 'symlink' });

    await expect(run([{ path: 'x', size: 1 }], 'missing', disk)).rejects.toBeInstanceOf(
      FileNotFoundError,
    );
    await expect(run([{ path: 'x', size: 1 }], 'a.txt', disk)).rejects.toBeInstanceOf(
      WorkspaceNotADirectoryError,
    );
    await expect(run([{ path: 'x', size: 1 }], 'pipe', disk)).rejects.toBeInstanceOf(
      WorkspaceNotADirectoryError,
    );
    await expect(run([{ path: 'x', size: 1 }], 'link', disk)).resolves.toHaveLength(1);
  });
});

describe('ReadLimitsUseCase', () => {
  it('says every ceiling by the names of the contract — B-47', () => {
    const limits = new ReadLimitsUseCase({ maxEditBytes: 10, largeFileBytes: 5 }, LIMITS, {
      maxFileBytes: 7,
    });

    expect(limits.execute()).toEqual({
      maxEditBytes: 10,
      largeFileBytes: 5,
      downloadMaxBytes: 1000,
      archiveMaxEntries: 10,
      uploadMaxBytes: 100,
      uploadMaxEntries: 3,
      uploadMaxTotalBytes: 150,
      historyMaxFileBytes: 7,
    });
  });
});
