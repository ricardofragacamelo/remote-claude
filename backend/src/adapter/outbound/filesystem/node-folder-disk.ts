import { constants } from 'node:fs';
import type { Stats } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { posix } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';

import type {
  CopyCeiling,
  EntryCount,
  EntryInspection,
  FileBytes,
  FolderDisk,
  TreeRead,
  WriteGuard,
  WrittenFile,
} from '@application/files';
// What previews and transfer added to the port (plan 07, F7).
import type {
  ArchiveEntry,
  ArchiveSource,
  ChunkSource,
  OutgoingBytes,
  RawFile,
  StagedFile,
} from '@application/files';
import {
  FileChangedError,
  FileExistsError,
  FileNotAFileError,
  FileNotFoundError,
  FileTooLargeError,
} from '@domain/files';
import type { Etag, FilePath } from '@domain/files';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { AtomicFileWriter, CHUNK_BYTES, NEW_FILE_MODE } from './atomic-file.writer';
import { FolderArchive } from './folder-archive';
import { FolderEntryCopier } from './folder-entry.copier';
import { codeOf, failureOf, isAbsent, kindOf, nodeFolderFileSystem } from './folder-file-system';
import type { FolderFileSystem } from './folder-file-system';
import { FolderFence } from './folder-fence';
import { FolderRawReader } from './folder-raw.reader';
import { FolderTreeReader } from './folder-tree.reader';

/** Filesystems with no hard links answer a `link` with one of these; a move then renames. */
const NO_HARD_LINKS = new Set(['EPERM', 'ENOTSUP', 'EOPNOTSUPP']);

/**
 * The disk of the open folders, in Node — the one place the `files` module touches it.
 *
 * Every call runs the disk half of the fence ({@link FolderFence}) before it does anything, and
 * logs both ends at `debug` — the folder, the path, bytes or counts, how long it took and how it
 * ended — **never** what a file holds, and never the names a listing found
 * (docs/architecture/shared/03-logging.md#redação-o-que-nunca-vai-para-o-log). A suite writes a
 * marker into a file and looks for it in every line of the request (S-61).
 */
@Injectable()
export class NodeFolderDisk implements FolderDisk {
  private readonly fence: FolderFence;
  private readonly tree: FolderTreeReader;
  private readonly writer: AtomicFileWriter;
  private readonly copier: FolderEntryCopier;
  private readonly raw: FolderRawReader;
  private readonly zip: FolderArchive;

  constructor(
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly fs: FolderFileSystem = nodeFolderFileSystem,
  ) {
    this.fence = new FolderFence(fs);
    this.tree = new FolderTreeReader(fs, this.fence);
    this.writer = new AtomicFileWriter(fs, this.fence);
    this.copier = new FolderEntryCopier(fs);
    this.raw = new FolderRawReader(this.fence);
    this.zip = new FolderArchive(fs, this.fence);
  }

  list(directory: FilePath, limit: number): Promise<TreeRead> {
    return this.logged(
      'files.list',
      directory,
      () => this.tree.read(directory, limit),
      (read) => ({
        count: read.children.length,
        truncated: !read.exhausted,
      }),
    );
  }

  read(file: FilePath, limit: number): Promise<FileBytes> {
    return this.logged(
      'files.read',
      file,
      () => this.readBytes(file, limit),
      (read) => ({
        bytes: read.bytes.length,
      }),
    );
  }

  version(file: FilePath): Promise<Etag | null> {
    return this.logged(
      'files.version',
      file,
      () => this.writer.version(file),
      (etag) => ({
        found: etag !== null,
      }),
    );
  }

  inspect(entry: FilePath): Promise<EntryInspection | null> {
    return this.logged(
      'files.inspect',
      entry,
      () => this.inspectEntry(entry),
      (found) => ({
        kind: found?.kind ?? 'missing',
      }),
    );
  }

  locate(entry: FilePath): Promise<string> {
    return this.logged(
      'files.locate',
      entry,
      () => this.fence.locate(entry),
      () => ({}),
    );
  }

  write(file: FilePath, bytes: Uint8Array, guard: WriteGuard): Promise<WrittenFile> {
    return this.logged(
      'files.write',
      file,
      () => this.writer.replace(file, bytes, guard),
      (written) => ({
        bytes: written.size,
      }),
    );
  }

  create(entry: FilePath, content: Uint8Array | null): Promise<void> {
    return this.logged(
      'files.create',
      entry,
      () => this.createEntry(entry, content),
      () => ({ bytes: content?.length ?? null }),
    );
  }

  move(from: FilePath, to: FilePath): Promise<void> {
    return this.logged(
      'files.move',
      from,
      () => this.moveEntry(from, to),
      () => ({
        to: to.relative,
      }),
    );
  }

  copy(from: FilePath, to: FilePath, ceiling: CopyCeiling): Promise<void> {
    return this.logged(
      'files.copy',
      from,
      () => this.copyEntry(from, to, ceiling),
      () => ({
        to: to.relative,
      }),
    );
  }

  count(directory: FilePath, cap: number): Promise<EntryCount> {
    return this.logged(
      'files.count',
      directory,
      () => this.countEntries(directory, cap),
      (count) => ({
        count: count.count,
        capped: count.capped,
      }),
    );
  }

  remove(entry: FilePath, recursive: boolean): Promise<void> {
    return this.logged(
      'files.remove',
      entry,
      () => this.removeEntry(entry, recursive),
      () => ({
        recursive,
      }),
    );
  }

  openRaw(file: FilePath): Promise<RawFile> {
    return this.logged(
      'files.raw',
      file,
      () => this.raw.open(file),
      (raw) => ({
        bytes: raw.size,
      }),
    );
  }

  survey(selection: readonly FilePath[], ceiling: CopyCeiling): Promise<readonly ArchiveSource[]> {
    const [first] = selection;

    // A selection is of one folder, and the line names the first item; the count says the rest.
    return first === undefined
      ? Promise.resolve([])
      : this.logged(
          'files.survey',
          first,
          () => this.zip.survey(selection, ceiling),
          (found) => ({
            selected: selection.length,
            count: found.length,
          }),
        );
  }

  archive(entries: readonly ArchiveEntry[]): Promise<OutgoingBytes> {
    this.logger.debug(
      { op: 'files.archive', layer: 'adapter', count: entries.length },
      'files.archive started',
    );

    return Promise.resolve(this.zip.archive(entries));
  }

  stage(entry: FilePath, source: ChunkSource, size: number): Promise<StagedFile> {
    return this.logged(
      'files.stage',
      entry,
      () => this.staged(entry, source, size),
      (staged) => ({
        bytes: staged.size,
      }),
    );
  }

  /**
   * The bytes of an upload, in a temporary where they will be linked or renamed from: beside the
   * file they replace — with its mode — or in the nearest folder that exists above a new one, so
   * the folders it needs are made only after the trail was told.
   */
  private async staged(entry: FilePath, source: ChunkSource, size: number): Promise<StagedFile> {
    const existing = await this.fence.realInside(entry).catch((error: unknown) => {
      if (error instanceof FileNotFoundError) {
        return null;
      }

      throw error;
    });
    const folder =
      existing === null ? await this.fence.nearestFolder(entry.parent()) : posix.dirname(existing);
    const mode = existing === null ? NEW_FILE_MODE : (await this.fs.lstat(existing)).mode & 0o7777;
    const { temporary, etag } = await this.writer.stage(entry, folder, source, size, mode);

    return {
      etag,
      size,
      create: (target) =>
        this.logged(
          'files.place',
          target,
          () => this.writer.place(target, temporary),
          (written) => ({ bytes: written.size }),
        ),
      replace: (target, guard) =>
        this.logged(
          'files.write',
          target,
          () => this.writer.replaceStaged(target, temporary, guard),
          (written) => ({ bytes: written.size }),
        ),
      discard: () => this.writer.discard(temporary),
    };
  }

  /**
   * Bytes from one descriptor, at most `limit` — read one past it, so a file that grew past the
   * ceiling after it was opened is refused rather than cut (S-55).
   */
  private async readBytes(file: FilePath, limit: number): Promise<FileBytes> {
    const real = await this.fence.realInside(file);
    // `O_NONBLOCK`: opening a FIFO for reading would otherwise wait for a writer (S-57).
    const handle = await this.fence.open(file, real, constants.O_RDONLY | constants.O_NONBLOCK);

    try {
      const stats = await handle.stat();

      if (!stats.isFile()) {
        throw new FileNotAFileError(file.relative);
      }

      const bytes = await readUpTo(handle, limit + 1);

      if (bytes.length > limit) {
        throw new FileTooLargeError(
          file.relative,
          Math.max(stats.size, bytes.length),
          limit,
          'bytes',
        );
      }

      return { bytes, mtime: stats.mtime };
    } finally {
      await handle.close();
    }
  }

  private async inspectEntry(entry: FilePath): Promise<EntryInspection | null> {
    const own = await this.fence.ownPath(entry);
    let stats: Stats;

    try {
      stats = await this.fs.lstat(own);
    } catch (error) {
      if (isAbsent(error)) {
        return null;
      }

      throw failureOf(entry, error);
    }

    return {
      kind: kindOf(stats),
      size: stats.size,
      identity: identityOf(stats),
    };
  }

  private async createEntry(entry: FilePath, content: Uint8Array | null): Promise<void> {
    const folder = await this.fence.ensureFolders(entry.parent());

    if (content !== null) {
      await this.writer.create(entry, folder, content);
      return;
    }

    try {
      await this.fs.mkdir(posix.join(folder, entry.name));
    } catch (error) {
      throw failureOf(entry, error);
    }
  }

  /**
   * Moves without replacing ([07 · D-12](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-12--mover-sem-sobrescrever)):
   * a file by `link` and `unlink` — the `link` fails if the name is taken, atomically — and a
   * folder, which has no hard links, by a check and a `rename` under the lock of both paths. The
   * same entry under another case is renamed in place (S-99).
   */
  private async moveEntry(from: FilePath, to: FilePath): Promise<void> {
    const source = await this.fence.ownPath(from);
    const target = posix.join(await this.fence.ensureFolders(to.parent()), to.name);

    try {
      const stats = await this.fs.lstat(source);
      const there = await entryAt(this.fs, target);

      if (stats.isDirectory() || (there !== null && isSameEntry(there, stats))) {
        await this.renameFree(to, source, target, stats);
        return;
      }

      await this.linkThenUnlink(to, source, target, stats);
    } catch (error) {
      throw failureOf(from, error);
    }
  }

  private async linkThenUnlink(
    to: FilePath,
    source: string,
    target: string,
    stats: Stats,
  ): Promise<void> {
    try {
      await this.fs.link(source, target);
    } catch (error) {
      if (codeOf(error) === 'EEXIST') {
        throw new FileExistsError(to.relative);
      }

      if (!NO_HARD_LINKS.has(codeOf(error))) {
        throw error;
      }

      await this.renameFree(to, source, target, stats);
      return;
    }

    await this.fs.unlink(source);
  }

  /** A `rename` onto a name that is free, or that is the source itself — checked right before. */
  private async renameFree(
    to: FilePath,
    source: string,
    target: string,
    stats: Stats,
  ): Promise<void> {
    const there = await entryAt(this.fs, target);

    if (there !== null && !isSameEntry(there, stats)) {
      throw new FileExistsError(to.relative);
    }

    await this.fs.rename(source, target);
  }

  private async copyEntry(from: FilePath, to: FilePath, ceiling: CopyCeiling): Promise<void> {
    const source = await this.fence.ownPath(from);
    const folder = await this.fence.ensureFolders(to.parent());

    try {
      await this.copier.copy(from, source, posix.join(folder, to.name), ceiling);
    } catch (error) {
      throw codeOf(error) === 'EEXIST' ? new FileExistsError(to.relative) : error;
    }
  }

  /** Every entry under a folder, never through a link, stopping one past `cap` (S-111). */
  private async countEntries(directory: FilePath, cap: number): Promise<EntryCount> {
    const real = await this.fence.realInside(directory);
    const count = await countUnder(this.fs, real, cap + 1);

    return count > cap ? { count: cap, capped: true } : { count, capped: false };
  }

  private async removeEntry(entry: FilePath, recursive: boolean): Promise<void> {
    const own = await this.fence.ownPath(entry);

    try {
      const stats = await this.fs.lstat(own);

      if (!stats.isDirectory()) {
        await this.fs.unlink(own);
      } else if (recursive) {
        // `rm` looks at each entry with `lstat`: a link inside is removed, never followed (S-114).
        await this.fs.rm(own, { recursive: true, force: false });
      } else {
        await this.fs.rmdir(own);
      }
    } catch (error) {
      // Something arrived in the folder after it was counted empty: it is not the folder agreed to.
      throw codeOf(error) === 'ENOTEMPTY'
        ? new FileChangedError(entry.relative, null)
        : failureOf(entry, error);
    }
  }

  /** Both ends of one call at `debug`, with `durationMs` on the way out — never the contents. */
  private async logged<T>(
    op: string,
    entry: FilePath,
    work: () => Promise<T>,
    summary: (result: T) => Readonly<Record<string, unknown>>,
  ): Promise<T> {
    const startedAt = Date.now();
    const context = { op, layer: 'adapter', folder: entry.folder.value, path: entry.relative };

    this.logger.debug(context, `${op} started`);

    try {
      const result = await work();
      this.logger.debug(
        { ...context, ...summary(result), outcome: 'done', durationMs: Date.now() - startedAt },
        `${op} done`,
      );
      return result;
    } catch (error) {
      this.logger.debug(
        {
          ...context,
          outcome: 'refused',
          errorCode: codeOf(error),
          durationMs: Date.now() - startedAt,
        },
        `${op} refused`,
      );
      throw error;
    }
  }
}

/** Up to `max` bytes of an open file. */
async function readUpTo(handle: FileHandle, max: number): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let total = 0;

  while (total < max) {
    const chunk = Buffer.alloc(Math.min(CHUNK_BYTES, max - total));
    const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);

    if (bytesRead === 0) {
      break;
    }

    chunks.push(chunk.subarray(0, bytesRead));
    total += bytesRead;
  }

  return Buffer.concat(chunks, total);
}

/** What is at `target`, without following it; `null` when nothing is. */
async function entryAt(fs: FolderFileSystem, target: string): Promise<Stats | null> {
  try {
    return await fs.lstat(target);
  } catch (error) {
    if (isAbsent(error)) {
      return null;
    }

    throw error;
  }
}

/** Whether two `lstat`s are of one entry — the same file under another case, on a disk that ignores it. */
function isSameEntry(left: Stats, right: Stats): boolean {
  return identityOf(left) === identityOf(right);
}

/** `<device>:<inode>` — what one entry is, whatever names it has. */
function identityOf(stats: Stats): string {
  return `${String(stats.dev)}:${String(stats.ino)}`;
}

/** How many entries are under `folder`, all the way down, never through a link — up to `max`. */
async function countUnder(fs: FolderFileSystem, folder: string, max: number): Promise<number> {
  let count = 0;

  for await (const entry of await fs.opendir(folder, { encoding: 'buffer' })) {
    count += 1;

    if (count >= max) {
      return count;
    }

    if (entry.isDirectory()) {
      count += await countUnder(fs, posix.join(folder, String(entry.name)), max - count);
    }

    if (count >= max) {
      return count;
    }
  }

  return count;
}
