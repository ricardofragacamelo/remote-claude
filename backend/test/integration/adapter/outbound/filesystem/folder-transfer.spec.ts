import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ChunkSource, OutgoingBytes } from '@application/files';
import {
  Etag,
  FileChangedError,
  FileExistsError,
  FileNotAFileError,
  FilePath,
  UploadSizeMismatchError,
} from '@domain/files';
import { WorkspaceNotAllowedError, WorkspacePath } from '@domain/workspace';
import { nodeFolderFileSystem } from '@adapter/outbound/filesystem/folder-file-system';
import type { FolderFileSystem } from '@adapter/outbound/filesystem/folder-file-system';
import { NodeFolderDisk } from '@adapter/outbound/filesystem/node-folder-disk';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';
import { readZip } from '../../../../support/files/zip-reader';

/** A failure of the operating system, as `node:fs` raises one. */
function systemError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

/** A source that hands out `chunks`, then ends — or fails, at the end, with `failure`. */
function sourceOf(chunks: readonly string[], failure: Error | null = null): ChunkSource {
  const left = [...chunks];

  return {
    next: () => {
      const chunk = left.shift();

      if (chunk !== undefined) {
        return Promise.resolve(Buffer.from(chunk));
      }

      return failure === null ? Promise.resolve(null) : Promise.reject(failure);
    },
  };
}

/** Every chunk of outgoing bytes, as one buffer. */
async function drained(bytes: OutgoingBytes): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of bytes.chunks) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

/** The temporaries of ours left anywhere under a folder. */
async function temporariesUnder(folder: string): Promise<string[]> {
  return (await readdir(folder, { recursive: true })).filter((name) => name.includes('.rc-'));
}

/**
 * The transfer half of the disk, against a real filesystem — plan 07, B-48 and B-49: the raw
 * reader, the walk and the zip, and the staging of an upload. The moments an HTTP request cannot
 * stage — an entry that vanishes or turns into a FIFO between the walk and the zip, a disk that
 * refuses a look — are staged here, through the facade the adapter reads the disk with.
 */
describe('NodeFolderDisk — previews and transfer', () => {
  let base: string;
  let folder: string;
  let open: WorkspacePath;
  let disk: NodeFolderDisk;

  beforeEach(async () => {
    base = await realpath(await mkdtemp(path.join(tmpdir(), 'rc-folder-transfer-')));
    folder = path.join(base, 'project');
    await mkdir(folder);
    open = WorkspacePath.create(folder);
    disk = new NodeFolderDisk(new RecordingLogger().logger);
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  const at = (...segments: string[]): string => path.join(folder, ...segments);
  const entry = (relative: string): FilePath => FilePath.create(open, relative);
  const withFs = (overrides: Partial<FolderFileSystem>): NodeFolderDisk =>
    new NodeFolderDisk(new RecordingLogger().logger, { ...nodeFolderFileSystem, ...overrides });

  describe('openRaw', () => {
    it('reads the version, the head and a part from one descriptor, and closes once', async () => {
      await writeFile(at('a.txt'), '0123456789');

      const raw = await disk.openRaw(entry('a.txt'));
      const version = await raw.digest();
      const part = await drained(raw.bytes(3, 5));

      expect(version).toEqual(Etag.of(Buffer.from('0123456789')));
      expect(Buffer.from(raw.head).toString()).toBe('0123456789');
      expect(part.toString()).toBe('345');
      expect(raw).toMatchObject({ size: 10, realPath: at('a.txt') });
      expect(raw.identity.split(':')).toHaveLength(5);
      await raw.close();
      await expect(raw.close()).resolves.toBeUndefined();
    });

    it('streams nothing of an empty file', async () => {
      await writeFile(at('empty'), '');
      const raw = await disk.openRaw(entry('empty'));

      expect(await drained(raw.bytes(0, -1))).toHaveLength(0);
      await raw.close();
    });

    it('refuses a folder and a FIFO, and leaves no descriptor open', async () => {
      await mkdir(at('sub'));
      execFileSync('mkfifo', [at('pipe')]);

      await expect(disk.openRaw(entry('sub'))).rejects.toBeInstanceOf(FileNotAFileError);
      await expect(disk.openRaw(entry('pipe'))).rejects.toBeInstanceOf(FileNotAFileError);
    });
  });

  describe('survey', () => {
    it('finds nothing in an empty selection', async () => {
      expect(await disk.survey([], { entries: 10, bytes: 10 })).toEqual([]);
    });

    it('takes a selected link to a file inside as the file it leads to', async () => {
      await writeFile(at('a.txt'), 'abc');
      await symlink(at('a.txt'), at('link'));

      const found = await disk.survey([entry('link')], { entries: 10, bytes: 10 });

      expect(found).toMatchObject([{ selection: 0, kind: 'file', size: 3 }]);
      expect(found[0]?.path.relative).toBe('link');
    });

    it('leaves out a child that vanished between the listing and the look', async () => {
      await mkdir(at('src'));
      await writeFile(at('src', 'a.ts'), 'a');
      await writeFile(at('src', 'gone.ts'), 'b');
      const vanishing = withFs({
        lstat: (target) =>
          String(target).endsWith('gone.ts')
            ? Promise.reject(systemError('ENOENT'))
            : nodeFolderFileSystem.lstat(target),
      });

      const found = await vanishing.survey([entry('src')], { entries: 10, bytes: 10 });

      expect(found.map((source) => source.path.relative)).toEqual(['src', 'src/a.ts']);
    });

    it('lets a refusal of the disk through, rather than leave a child out in silence', async () => {
      await mkdir(at('src'));
      await writeFile(at('src', 'a.ts'), 'a');
      const refusing = withFs({
        lstat: (target) =>
          String(target).endsWith('a.ts')
            ? Promise.reject(systemError('EIO'))
            : nodeFolderFileSystem.lstat(target),
      });

      await expect(refusing.survey([entry('src')], { entries: 10, bytes: 10 })).rejects.toThrow(
        'EIO',
      );
    });

    it('says why a selected item could not be looked at', async () => {
      await writeFile(at('a.txt'), 'a');
      const refusing = withFs({ stat: () => Promise.reject(systemError('EACCES')) });

      await expect(
        refusing.survey([entry('a.txt')], { entries: 10, bytes: 10 }),
      ).rejects.toMatchObject({ code: 'FILE_ACCESS_DENIED' });
    });

    it('refuses a selected link that leads out', async () => {
      await mkdir(path.join(base, 'outside'));
      await symlink(path.join(base, 'outside'), at('escape'));

      await expect(
        disk.survey([entry('escape')], { entries: 10, bytes: 10 }),
      ).rejects.toBeInstanceOf(WorkspaceNotAllowedError);
    });
  });

  describe('archive', () => {
    it('cuts the zip when a file turned into something else since the walk', async () => {
      await writeFile(at('a.txt'), 'a');
      const found = await disk.survey([entry('a.txt')], { entries: 10, bytes: 10 });
      await rm(at('a.txt'));
      execFileSync('mkfifo', [at('a.txt')]);

      const zip = await disk.archive(found.map((source) => ({ ...source, name: 'a.txt' })));

      await expect(drained(zip)).rejects.toBeInstanceOf(FileNotAFileError);
      await zip.close();
    });

    it('cuts the zip when a file is gone since the walk', async () => {
      await writeFile(at('a.txt'), 'a');
      const found = await disk.survey([entry('a.txt')], { entries: 10, bytes: 10 });
      await rm(at('a.txt'));

      const zip = await disk.archive(found.map((source) => ({ ...source, name: 'a.txt' })));

      await expect(drained(zip)).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
    });

    it('opens nothing once closed, and closing twice is closing once', async () => {
      await writeFile(at('a.txt'), 'a');
      const found = await disk.survey([entry('a.txt')], { entries: 10, bytes: 10 });

      const zip = await disk.archive(found.map((source) => ({ ...source, name: 'a.txt' })));
      await zip.close();
      await zip.close();

      await expect(drained(zip)).rejects.toThrow();
    });

    it('streams a valid zip of what the walk found', async () => {
      await mkdir(at('src'));
      await writeFile(at('src', 'a.ts'), 'export {};\n');
      const found = await disk.survey([entry('src')], { entries: 10, bytes: 100 });

      const zip = await disk.archive(
        found.map((source) => ({ ...source, name: source.path.relative })),
      );
      const contents = await readZip(await drained(zip));

      expect(contents.get('src/a.ts')?.toString()).toBe('export {};\n');
      expect(contents.has('src/')).toBe(true);
    });
  });

  describe('stage', () => {
    it('puts a staged file at its name, making the folders above only then', async () => {
      const staged = await disk.stage(entry('a/b/c.txt'), sourceOf(['he', 'llo']), 5);

      expect(await temporariesUnder(folder)).toHaveLength(1);
      expect(await readdir(folder)).toHaveLength(1);
      expect(staged.etag).toEqual(Etag.of(Buffer.from('hello')));

      await staged.create(entry('a/b/c.txt'));
      await staged.discard();
      await staged.discard();

      expect(await readFile(at('a', 'b', 'c.txt'), 'utf8')).toBe('hello');
      expect(await temporariesUnder(folder)).toEqual([]);
    });

    it('never puts it over anything', async () => {
      await writeFile(at('a.txt'), 'mine');
      const staged = await disk.stage(entry('b.txt'), sourceOf(['x']), 1);

      await expect(staged.create(entry('a.txt'))).rejects.toBeInstanceOf(FileExistsError);
      await staged.discard();

      expect(await readFile(at('a.txt'), 'utf8')).toBe('mine');
      expect(await temporariesUnder(folder)).toEqual([]);
    });

    it.each([
      ['longer than declared', ['abc', 'def'], 4],
      ['shorter than declared', ['ab'], 4],
    ])('refuses a part %s and leaves no temporary', async (_name, chunks, size) => {
      await expect(disk.stage(entry('a.txt'), sourceOf(chunks), size)).rejects.toBeInstanceOf(
        UploadSizeMismatchError,
      );
      expect(await readdir(folder)).toEqual([]);
    });

    it('leaves no temporary when the source itself fails', async () => {
      await expect(
        disk.stage(entry('a.txt'), sourceOf(['ab'], new Error('the socket broke')), 4),
      ).rejects.toThrow('the socket broke');
      expect(await readdir(folder)).toEqual([]);
    });

    it('replaces a file atomically, with its mode, the guard asked right before', async () => {
      await writeFile(at('a.sh'), 'old', { mode: 0o750 });
      const staged = await disk.stage(entry('a.sh'), sourceOf(['new']), 3);
      const seen: (string | null)[] = [];

      await staged.replace(entry('a.sh'), (current) => {
        seen.push(current?.value ?? null);
      });
      await staged.discard();

      expect(seen).toEqual([Etag.of(Buffer.from('old')).value]);
      expect(await readFile(at('a.sh'), 'utf8')).toBe('new');
      expect(
        execFileSync('stat', ['-c', '%a', at('a.sh')])
          .toString()
          .trim(),
      ).toBe('750');
    });

    it('writes in place over a file with another hard link, so the link sees it — D-05', async () => {
      await writeFile(at('a.txt'), 'old');
      await link(at('a.txt'), at('other-name.txt'));
      const staged = await disk.stage(entry('a.txt'), sourceOf(['new contents']), 12);

      await staged.replace(entry('a.txt'), () => undefined);
      await staged.discard();

      expect(await readFile(at('other-name.txt'), 'utf8')).toBe('new contents');
      expect(await temporariesUnder(folder)).toEqual([]);
    });

    it('lets the guard keep a version written meanwhile', async () => {
      await writeFile(at('a.txt'), 'old');
      const staged = await disk.stage(entry('a.txt'), sourceOf(['new']), 3);

      await expect(
        staged.replace(entry('a.txt'), (current) => {
          throw new FileChangedError('a.txt', current?.value ?? null);
        }),
      ).rejects.toBeInstanceOf(FileChangedError);
      await staged.discard();

      expect(await readFile(at('a.txt'), 'utf8')).toBe('old');
    });

    it('asks the guard about a file that is gone, and never re-creates it', async () => {
      await writeFile(at('a.txt'), 'old');
      const staged = await disk.stage(entry('a.txt'), sourceOf(['new']), 3);
      await rm(at('a.txt'));
      const seen: unknown[] = [];

      await expect(
        staged.replace(entry('a.txt'), (current) => {
          seen.push(current);
          throw new FileChangedError('a.txt', null);
        }),
      ).rejects.toBeInstanceOf(FileChangedError);
      await staged.discard();

      expect(seen).toEqual([null]);
      expect(await readdir(folder)).toEqual([]);
    });

    it('refuses to stage over a link that leads out', async () => {
      await mkdir(path.join(base, 'outside'));
      await writeFile(path.join(base, 'outside', 'secret'), 's');
      await symlink(path.join(base, 'outside', 'secret'), at('out'));

      await expect(disk.stage(entry('out'), sourceOf(['x']), 1)).rejects.toBeInstanceOf(
        WorkspaceNotAllowedError,
      );
    });

    it('lets a refusal of the disk through when it looks for the nearest folder', async () => {
      const refusing = withFs({ realpath: () => Promise.reject(systemError('EACCES')) });

      await expect(refusing.stage(entry('a/b.txt'), sourceOf(['x']), 1)).rejects.toMatchObject({
        code: 'FILE_ACCESS_DENIED',
      });
    });
  });
});
