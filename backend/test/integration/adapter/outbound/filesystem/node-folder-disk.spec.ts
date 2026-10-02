import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { constants } from 'node:fs';
import {
  appendFile,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ListTreeUseCase } from '@application/files';
import {
  Etag,
  FileAccessDeniedError,
  FileChangedError,
  FileExistsError,
  FileNotAFileError,
  FileOperationInvalidError,
  FilePath,
  FileTooLargeError,
  StorageFullError,
} from '@domain/files';
import { WorkspaceNotAllowedError, WorkspacePath } from '@domain/workspace';
import { nodeFolderFileSystem } from '@adapter/outbound/filesystem/folder-file-system';
import type { FolderFileSystem } from '@adapter/outbound/filesystem/folder-file-system';
import { NodeFolderDisk } from '@adapter/outbound/filesystem/node-folder-disk';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

/** A failure of the operating system, as `node:fs` raises one. */
function systemError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

/** The guard of a save that accepts whatever is on disk. */
const anyVersion = (): void => undefined;

/**
 * The disk of the open folders, against a real filesystem — plan 07, F1 and F2.
 *
 * The moments an HTTP request cannot stage are staged here, through the facade the adapter reads
 * the disk with: a folder swapped for a link between the check and the open, an entry vanishing
 * mid-listing, a disk that fills up halfway, another filesystem under the destination.
 */
describe('NodeFolderDisk', () => {
  let base: string;
  let folder: string;
  let outside: string;
  let log: RecordingLogger;

  beforeEach(async () => {
    base = await realpath(await mkdtemp(path.join(tmpdir(), 'rc-folder-disk-')));
    folder = path.join(base, 'project');
    outside = path.join(base, 'outside');
    await mkdir(folder);
    await mkdir(outside);
    await writeFile(path.join(outside, 'secret.txt'), 'secret\n');
    log = new RecordingLogger();
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  const entry = (relative: string): FilePath =>
    FilePath.create(WorkspacePath.create(folder), relative);
  const at = (...segments: string[]): string => path.join(folder, ...segments);
  const disk = (fs: FolderFileSystem = nodeFolderFileSystem): NodeFolderDisk =>
    new NodeFolderDisk(log.logger, fs);

  describe('the descriptor check — B-07', () => {
    it('reads nothing when a folder on the way became a link out after the check — S-25', async () => {
      await mkdir(at('dir'));
      await writeFile(at('dir', 'secret.txt'), 'inside\n');

      const swapping: FolderFileSystem = {
        ...nodeFolderFileSystem,
        open: async (target, flags, mode) => {
          await rename(at('dir'), at('dir-moved'));
          await symlink(outside, at('dir'));
          return nodeFolderFileSystem.open(target, flags, mode);
        },
      };

      await expect(disk(swapping).read(entry('dir/secret.txt'), 1024)).rejects.toBeInstanceOf(
        WorkspaceNotAllowedError,
      );
    });

    it('works where there is no /proc, with the realpath check alone — R-02', async () => {
      await writeFile(at('a.txt'), 'a\n');
      const withoutProc: FolderFileSystem = {
        ...nodeFolderFileSystem,
        readlink: (target) =>
          target.startsWith('/proc/') ? Promise.reject(systemError('ENOENT')) : readlinkOf(target),
      };

      expect((await disk(withoutProc).read(entry('a.txt'), 1024)).bytes.toString()).toBe('a\n');
      expect((await disk(withoutProc).list(entry(''), 10)).children).toHaveLength(1);
    });

    it('lets a failure of /proc other than its absence through', async () => {
      await writeFile(at('a.txt'), 'a\n');
      const brokenProc: FolderFileSystem = {
        ...nodeFolderFileSystem,
        readlink: (target) =>
          target.startsWith('/proc/') ? Promise.reject(systemError('EIO')) : readlinkOf(target),
      };

      await expect(disk(brokenProc).read(entry('a.txt'), 1024)).rejects.toMatchObject({
        code: 'EIO',
      });
    });
  });

  describe('the tree — B-08', () => {
    it('says truncated only past the ceiling — S-30', async () => {
      const folders = { resolve: () => Promise.resolve(WorkspacePath.create(folder)) };
      const tree = new ListTreeUseCase(folders, disk(), { treeEntries: 3 });
      const user = { value: 'auth|42' } as never;

      await mkdir(at('three'));
      await mkdir(at('four'));
      for (const name of ['a', 'b', 'c']) {
        await writeFile(at('three', name), '');
        await writeFile(at('four', name), '');
      }
      await writeFile(at('four', 'd'), '');

      const exact = await tree.execute({ folder, path: 'three' }, user);
      const past = await tree.execute({ folder, path: 'four' }, user);

      expect(exact).toMatchObject({ truncated: false });
      expect(exact.entries).toHaveLength(3);
      expect(past).toMatchObject({ truncated: true });
      expect(past.entries).toHaveLength(3);
    });

    it('leaves out, without an error, an entry gone between the read and its lstat — S-36', async () => {
      await writeFile(at('stays.txt'), '');
      await writeFile(at('goes.txt'), '');
      const deleting: FolderFileSystem = {
        ...nodeFolderFileSystem,
        lstat: async (target) => {
          if (String(target).endsWith('goes.txt')) {
            await rm(at('goes.txt'));
          }
          return nodeFolderFileSystem.lstat(target);
        },
      };

      const read = await disk(deleting).list(entry(''), 10);

      expect(read.children.map((child) => child.name)).toEqual(['stays.txt']);
    });

    it('lets a failure of an lstat that is not absence through', async () => {
      await writeFile(at('a.txt'), '');
      const failing: FolderFileSystem = {
        ...nodeFolderFileSystem,
        lstat: () => Promise.reject(systemError('EIO')),
      };

      await expect(disk(failing).list(entry(''), 10)).rejects.toMatchObject({ code: 'EIO' });
    });

    it('logs the count and whether the level was cut, never the names', async () => {
      await writeFile(at('private-name.txt'), '');

      await disk().list(entry(''), 10);

      const done = log.withOp('files.list').find((line) => line['outcome'] === 'done');
      expect(done).toMatchObject({ count: 1, truncated: false });
      expect(JSON.stringify(log.lines)).not.toContain('private-name');
    });
  });

  describe('reading — B-09', () => {
    it('reads one whole version while another process renames over it — S-54', async () => {
      const versions = ['a'.repeat(30_000), 'b'.repeat(50_000)];
      await writeFile(at('racy.txt'), versions[0] ?? '');
      let writing = true;

      const writer = (async () => {
        for (let round = 0; writing; round += 1) {
          await writeFile(at('next.tmp'), versions[round % 2] ?? '');
          await rename(at('next.tmp'), at('racy.txt'));
        }
      })();

      try {
        for (let read = 0; read < 40; read += 1) {
          const { bytes } = await disk().read(entry('racy.txt'), 100_000);
          const text = Buffer.from(bytes).toString();

          expect(versions).toContain(text);
          expect(Etag.of(bytes).value).toBe(Etag.of(Buffer.from(text)).value);
        }
      } finally {
        writing = false;
        await writer;
      }
    });

    it('refuses a file that grew past the ceiling after it was opened, rather than cut it — S-55', async () => {
      await writeFile(at('grows.txt'), 'a'.repeat(10));
      const growing: FolderFileSystem = {
        ...nodeFolderFileSystem,
        open: async (target, flags, mode) => {
          const handle = await nodeFolderFileSystem.open(target, flags, mode);
          await appendFile(at('grows.txt'), 'b'.repeat(100));
          return handle;
        },
      };

      await expect(disk(growing).read(entry('grows.txt'), 50)).rejects.toBeInstanceOf(
        FileTooLargeError,
      );
    });

    it('refuses something that is not a file, without reading it', async () => {
      await mkdir(at('folder'));

      await expect(disk().read(entry('folder'), 10)).rejects.toBeInstanceOf(FileNotAFileError);
    });

    it('hashes a file of any size as a stream, and has no version for a folder or nothing', async () => {
      await writeFile(at('big.txt'), 'x'.repeat(200_000));
      await mkdir(at('folder'));

      expect((await disk().version(entry('big.txt')))?.value).toBe(
        Etag.of(Buffer.from('x'.repeat(200_000))).value,
      );
      expect(await disk().version(entry('folder'))).toBeNull();
      expect(await disk().version(entry('nothing'))).toBeNull();
    });

    it('lets an unexpected failure to resolve a version through', async () => {
      const failing: FolderFileSystem = {
        ...nodeFolderFileSystem,
        realpath: () => Promise.reject(systemError('EIO')),
      };

      await expect(disk(failing).version(entry('a'))).rejects.toMatchObject({ code: 'EIO' });
    });
  });

  describe('writing — B-11', () => {
    it('leaves the original and no temporary when the disk fills up — S-69', async () => {
      await writeFile(at('a.txt'), 'original\n');
      const full: FolderFileSystem = {
        ...nodeFolderFileSystem,
        open: async (target, flags, mode) => {
          const handle = await nodeFolderFileSystem.open(target, flags, mode);

          return (flags & constants.O_CREAT) === 0 ? handle : failingWrites(handle, 'ENOSPC');
        },
      };

      await expect(
        disk(full).write(entry('a.txt'), Buffer.from('new\n'), anyVersion),
      ).rejects.toBeInstanceOf(StorageFullError);
      expect(await readFile(at('a.txt'), 'utf8')).toBe('original\n');
      expect(await readdir(folder)).toEqual(['a.txt']);
    });

    it('refuses when the file became a link out right before the rename — S-78', async () => {
      await writeFile(at('a.txt'), 'original\n');
      let temporaryMade = false;
      const swapping: FolderFileSystem = {
        ...nodeFolderFileSystem,
        open: async (target, flags, mode) => {
          if ((flags & constants.O_CREAT) !== 0) {
            temporaryMade = true;
          } else if (temporaryMade && target === at('a.txt')) {
            await rm(at('a.txt'));
            await symlink(path.join(outside, 'secret.txt'), at('a.txt'));
          }
          return nodeFolderFileSystem.open(target, flags, mode);
        },
      };

      await expect(
        disk(swapping).write(entry('a.txt'), Buffer.from('new\n'), anyVersion),
      ).rejects.toBeInstanceOf(WorkspaceNotAllowedError);
      expect(await readFile(path.join(outside, 'secret.txt'), 'utf8')).toBe('secret\n');
      expect(await readdir(outside)).toEqual(['secret.txt']);
      expect((await readdir(folder)).filter((name) => name.includes('.rc-'))).toEqual([]);
    });

    it('stops at the guard, and leaves no temporary behind', async () => {
      await writeFile(at('a.txt'), 'original\n');

      await expect(
        disk().write(entry('a.txt'), Buffer.from('new\n'), () => {
          throw new FileChangedError('a.txt', null);
        }),
      ).rejects.toBeInstanceOf(FileChangedError);
      expect(await readdir(folder)).toEqual(['a.txt']);
    });

    it('asks the guard about nothing when the file went away', async () => {
      const seen: (Etag | null)[] = [];

      await expect(
        disk().write(entry('gone.txt'), Buffer.from('x'), (current) => {
          seen.push(current);
          throw new FileChangedError('gone.txt', null);
        }),
      ).rejects.toBeInstanceOf(FileChangedError);
      expect(seen).toEqual([null]);
    });

    it('puts a hard-linked file back when its in-place write is refused — S-75', async () => {
      await writeFile(at('one.txt'), 'original\n');
      await link(at('one.txt'), at('two.txt'));

      await expect(
        disk().write(entry('one.txt'), Buffer.from('new\n'), () => {
          throw new FileChangedError('one.txt', null);
        }),
      ).rejects.toBeInstanceOf(FileChangedError);
      expect(await readFile(at('two.txt'), 'utf8')).toBe('original\n');
      expect((await readdir(folder)).sort()).toEqual(['one.txt', 'two.txt']);
    });

    it('says a read-only filesystem is one — S-77', async () => {
      await writeFile(at('a.txt'), 'x');
      const readOnly: FolderFileSystem = {
        ...nodeFolderFileSystem,
        open: (target, flags, mode) =>
          (flags & (constants.O_WRONLY | constants.O_RDWR)) !== 0
            ? Promise.reject(systemError('EROFS'))
            : nodeFolderFileSystem.open(target, flags, mode),
      };

      await expect(
        disk(readOnly).write(entry('a.txt'), Buffer.from('y'), anyVersion),
      ).rejects.toMatchObject({
        code: 'FILE_ACCESS_DENIED',
        params: { reason: 'readOnlyFileSystem' },
      });
    });

    it('leaves a temporary being written alone, and sweeps only ours', async () => {
      await writeFile(at('a.txt'), 'x');
      await writeFile(at('.a.txt.rc-backup.bak'), 'not ours to sweep');

      await disk().write(entry('a.txt'), Buffer.from('y'), anyVersion);

      expect((await readdir(folder)).sort()).toEqual(['.a.txt.rc-backup.bak', 'a.txt']);
    });
  });

  describe('creating — B-12', () => {
    it('never makes a folder above an entry through a link out — S-83', async () => {
      await symlink(outside, at('out'));

      await expect(disk().create(entry('out/new/x.txt'), Buffer.from('x'))).rejects.toBeInstanceOf(
        WorkspaceNotAllowedError,
      );
      expect(await readdir(outside)).toEqual(['secret.txt']);
    });

    it('accepts a folder above that somebody else made in between', async () => {
      const racing: FolderFileSystem = {
        ...nodeFolderFileSystem,
        mkdir: async (target) => {
          await nodeFolderFileSystem.mkdir(target);
          throw systemError('EEXIST');
        },
      };

      await disk(racing).create(entry('made/x.txt'), Buffer.from('x'));

      expect(await readFile(at('made', 'x.txt'), 'utf8')).toBe('x');
    });

    it('refuses a folder over an existing one', async () => {
      await mkdir(at('there'));

      await expect(disk().create(entry('there'), null)).rejects.toBeInstanceOf(FileExistsError);
    });
  });

  describe('moving — B-13', () => {
    it('refuses another filesystem, and leaves the source — S-95', async () => {
      await writeFile(at('a.txt'), 'a');
      await mkdir(at('d'));
      const otherDevice: FolderFileSystem = {
        ...nodeFolderFileSystem,
        link: () => Promise.reject(systemError('EXDEV')),
        rename: () => Promise.reject(systemError('EXDEV')),
      };

      for (const from of ['a.txt', 'd']) {
        await expect(
          disk(otherDevice).move(entry(from), entry(`moved-${from}`)),
        ).rejects.toMatchObject({
          code: 'FILE_OPERATION_INVALID',
          params: { reason: 'crossDevice' },
        });
      }
      expect((await readdir(folder)).sort()).toEqual(['a.txt', 'd']);
    });

    it('renames in place the same file under another case, on a disk that ignores case — S-99', async () => {
      await writeFile(at('case.txt'), 'c');
      // A filesystem that ignores case answers the new name with the file itself.
      const insensitive: FolderFileSystem = {
        ...nodeFolderFileSystem,
        lstat: (target) =>
          String(target).endsWith('CASE.txt')
            ? nodeFolderFileSystem.lstat(at('case.txt'))
            : nodeFolderFileSystem.lstat(target),
        link: () => Promise.reject(new Error('a case rename never links')),
      };

      await disk(insensitive).move(entry('case.txt'), entry('CASE.txt'));

      expect(await readdir(folder)).toEqual(['CASE.txt']);
    });

    it('renames where the filesystem has no hard links', async () => {
      await writeFile(at('a.txt'), 'a');
      const noLinks: FolderFileSystem = {
        ...nodeFolderFileSystem,
        link: () => Promise.reject(systemError('EPERM')),
      };

      await disk(noLinks).move(entry('a.txt'), entry('b.txt'));

      expect(await readdir(folder)).toEqual(['b.txt']);
    });

    it('lets any other failure of the link through, mapped', async () => {
      await writeFile(at('a.txt'), 'a');
      const full: FolderFileSystem = {
        ...nodeFolderFileSystem,
        link: () => Promise.reject(systemError('ENOSPC')),
      };

      await expect(disk(full).move(entry('a.txt'), entry('b.txt'))).rejects.toBeInstanceOf(
        StorageFullError,
      );
    });

    it('refuses a destination taken between the check and the link', async () => {
      await writeFile(at('a.txt'), 'a');
      const racing: FolderFileSystem = {
        ...nodeFolderFileSystem,
        link: async () => {
          await writeFile(at('b.txt'), 'theirs');
          throw systemError('EEXIST');
        },
      };

      await expect(disk(racing).move(entry('a.txt'), entry('b.txt'))).rejects.toBeInstanceOf(
        FileExistsError,
      );
      expect(await readFile(at('b.txt'), 'utf8')).toBe('theirs');
    });
  });

  describe('copying — B-14', () => {
    it('refuses past the ceiling before copying anything — S-104', async () => {
      await mkdir(at('src'));
      await writeFile(at('src', 'a'), '1234');
      await writeFile(at('src', 'b'), '5678');

      await expect(
        disk().copy(entry('src'), entry('by-entries'), { entries: 2, bytes: 1_000 }),
      ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE', params: { measure: 'entries', limit: 2 } });
      await expect(
        disk().copy(entry('src'), entry('by-bytes'), { entries: 100, bytes: 5 }),
      ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE', params: { measure: 'bytes', limit: 5 } });
      expect(await readdir(folder)).toEqual(['src']);
    });

    it('removes what it made when the disk fills up halfway — S-105', async () => {
      await mkdir(at('src'));
      await writeFile(at('src', 'a'), 'a');
      await writeFile(at('src', 'b'), 'b');
      let copied = 0;
      const filling: FolderFileSystem = {
        ...nodeFolderFileSystem,
        copyFile: async (from, to, mode) => {
          copied += 1;
          if (copied === 2) {
            throw systemError('ENOSPC');
          }
          await nodeFolderFileSystem.copyFile(from, to, mode);
        },
      };

      await expect(
        disk(filling).copy(entry('src'), entry('copy'), { entries: 100, bytes: 1_000 }),
      ).rejects.toBeInstanceOf(StorageFullError);
      expect(await readdir(folder)).toEqual(['src']);
    });

    it('never removes a destination that was there before', async () => {
      await writeFile(at('a'), 'a');
      await writeFile(at('b'), 'theirs');

      await expect(
        disk().copy(entry('a'), entry('b'), { entries: 10, bytes: 10 }),
      ).rejects.toBeInstanceOf(FileExistsError);
      expect(await readFile(at('b'), 'utf8')).toBe('theirs');
    });

    it('refuses to copy a FIFO', async () => {
      const fifo = at('pipe');
      const { execFileSync } = await import('node:child_process');
      execFileSync('mkfifo', [fifo]);

      await expect(
        disk().copy(entry('pipe'), entry('pipe-copy'), { entries: 10, bytes: 10 }),
      ).rejects.toBeInstanceOf(FileNotAFileError);
    });
  });

  describe('counting and deleting — B-15', () => {
    it('stops counting at the cap, and says so — S-111', async () => {
      await mkdir(at('many', 'inner'), { recursive: true });
      for (const name of ['a', 'b', 'c', 'd']) {
        await writeFile(at('many', 'inner', name), '');
      }

      expect(await disk().count(entry('many'), 3)).toEqual({ count: 3, capped: true });
      expect(await disk().count(entry('many'), 10)).toEqual({ count: 5, capped: false });
    });

    it('answers a folder that filled up after it was counted empty as changed', async () => {
      await mkdir(at('empty'));
      const filling: FolderFileSystem = {
        ...nodeFolderFileSystem,
        rmdir: async (target) => {
          await writeFile(path.join(target, 'late.txt'), '');
          return nodeFolderFileSystem.rmdir(target);
        },
      };

      await expect(disk(filling).remove(entry('empty'), false)).rejects.toBeInstanceOf(
        FileChangedError,
      );
    });

    it('says what the system refused to remove', async () => {
      await writeFile(at('a.txt'), '');
      const refusing: FolderFileSystem = {
        ...nodeFolderFileSystem,
        unlink: () => Promise.reject(systemError('EACCES')),
      };

      await expect(disk(refusing).remove(entry('a.txt'), false)).rejects.toBeInstanceOf(
        FileAccessDeniedError,
      );
    });
  });

  describe('what the operating system refuses', () => {
    it('says the source of a copy went away, rather than copy nothing', async () => {
      await expect(
        disk().copy(entry('gone'), entry('copy'), { entries: 10, bytes: 10 }),
      ).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
    });

    it('says a folder above could not be made', async () => {
      const refusing: FolderFileSystem = {
        ...nodeFolderFileSystem,
        mkdir: () => Promise.reject(systemError('EACCES')),
      };

      await expect(
        disk(refusing).create(entry('new/x.txt'), Buffer.from('x')),
      ).rejects.toBeInstanceOf(FileAccessDeniedError);
    });

    it('lets a folder that cannot be opened for an unforeseen reason through', async () => {
      const failing: FolderFileSystem = {
        ...nodeFolderFileSystem,
        open: () => Promise.reject(systemError('EIO')),
      };

      await expect(disk(failing).list(entry(''), 10)).rejects.toMatchObject({ code: 'EIO' });
    });

    it('says a destination it may not look at, rather than move onto it', async () => {
      await writeFile(at('a.txt'), 'a');
      const blind: FolderFileSystem = {
        ...nodeFolderFileSystem,
        lstat: (target) =>
          String(target).endsWith('b.txt')
            ? Promise.reject(systemError('EACCES'))
            : nodeFolderFileSystem.lstat(target),
      };

      await expect(disk(blind).move(entry('a.txt'), entry('b.txt'))).rejects.toBeInstanceOf(
        FileAccessDeniedError,
      );
      expect(await readdir(folder)).toEqual(['a.txt']);
    });

    it('leaves a hard-linked file alone when its backup cannot be made', async () => {
      await writeFile(at('one.txt'), 'original\n');
      await link(at('one.txt'), at('two.txt'));
      const full: FolderFileSystem = {
        ...nodeFolderFileSystem,
        copyFile: () => Promise.reject(systemError('ENOSPC')),
      };

      await expect(
        disk(full).write(entry('one.txt'), Buffer.from('new\n'), anyVersion),
      ).rejects.toBeInstanceOf(StorageFullError);
      expect(await readFile(at('two.txt'), 'utf8')).toBe('original\n');
    });

    it('writes when the folder cannot be swept, and stops on a failure it does not expect', async () => {
      await writeFile(at('a.txt'), 'x');
      const closed: FolderFileSystem = {
        ...nodeFolderFileSystem,
        opendir: () => Promise.reject(systemError('EACCES')),
      };
      const broken: FolderFileSystem = {
        ...nodeFolderFileSystem,
        opendir: () => Promise.reject(systemError('EIO')),
      };

      await disk(closed).write(entry('a.txt'), Buffer.from('y'), anyVersion);
      expect(await readFile(at('a.txt'), 'utf8')).toBe('y');
      await expect(
        disk(broken).write(entry('a.txt'), Buffer.from('z'), anyVersion),
      ).rejects.toMatchObject({ code: 'EIO' });
    });

    it('stops sweeping a crowded folder at its limit, and still writes', async () => {
      await mkdir(at('crowded'));
      await Promise.all(
        Array.from({ length: 10_001 }, (_, index) =>
          writeFile(at('crowded', `f${String(index)}`), ''),
        ),
      );

      await disk().write(entry('crowded/f0'), Buffer.from('y'), anyVersion);

      expect(await readFile(at('crowded', 'f0'), 'utf8')).toBe('y');
    });
  });

  describe('inspecting and locating', () => {
    it('says what is at a path without following it, and nothing for nothing', async () => {
      await symlink(outside, at('out'));

      expect(await disk().inspect(entry('out'))).toMatchObject({ kind: 'symlink' });
      expect(await disk().inspect(entry('nothing'))).toBeNull();
    });

    it('lets a failure to look that is not absence through, mapped', async () => {
      const refusing: FolderFileSystem = {
        ...nodeFolderFileSystem,
        lstat: () => Promise.reject(systemError('EACCES')),
      };

      await expect(disk(refusing).inspect(entry('a'))).rejects.toBeInstanceOf(
        FileAccessDeniedError,
      );
    });

    it('locates a link inside at its target, and a link out — or a broken one — at itself', async () => {
      await writeFile(at('real.txt'), '');
      await symlink(at('real.txt'), at('inside'));
      await symlink(outside, at('out'));
      await symlink(at('nowhere'), at('broken'));

      expect(await disk().locate(entry('inside'))).toBe(at('real.txt'));
      expect(await disk().locate(entry('out'))).toBe(at('out'));
      expect(await disk().locate(entry('broken'))).toBe(at('broken'));
      expect(await disk().locate(entry('not/yet/here.txt'))).toBe(at('not', 'yet', 'here.txt'));
      expect(await disk().locate(entry(''))).toBe(folder);
    });

    it('refuses a loop on the way for what does not exist yet', async () => {
      await symlink(at('loop-b'), at('loop-a'));
      await symlink(at('loop-a'), at('loop-b'));

      await expect(disk().locate(entry('loop-a/x'))).rejects.toBeInstanceOf(
        FileOperationInvalidError,
      );
    });
  });
});

function readlinkOf(target: string): Promise<string> {
  return nodeFolderFileSystem.readlink(target);
}

/** A handle whose writes fail with `code` — a disk that filled up after the file was created. */
function failingWrites(handle: FileHandle, code: string): FileHandle {
  return new Proxy(handle, {
    get(target, property, receiver) {
      if (property === 'writeFile') {
        return () => Promise.reject(systemError(code));
      }

      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}
