import { constants } from 'node:fs';
import type { ReadStream, Stats } from 'node:fs';
import { posix } from 'node:path';
import type { PassThrough } from 'node:stream';
import { ZipFile } from 'yazl';

import type { ArchiveEntry, ArchiveSource, CopyCeiling, OutgoingBytes } from '@application/files';
import { FileNotAFileError, FilePath, FileTooLargeError, HIDDEN_NAMES } from '@domain/files';
import { failureOf, isAbsent } from './folder-file-system';
import type { FolderFileSystem } from './folder-file-system';
import type { FolderFence } from './folder-fence';

const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

/** What a walk has found so far, and the ceiling it stops at. */
interface Tally {
  readonly found: ArchiveSource[];
  readonly ceiling: CopyCeiling;
  bytes: number;
}

/** Where a walk is: the item of the selection it is under, and the folder it is in. */
interface Place {
  readonly selection: number;
  readonly selected: FilePath;
  readonly directory: FilePath;
  readonly real: string;
}

/**
 * A folder, or a selection, as a zip — plan 07, B-48.
 *
 * **The walk** ({@link survey}) comes first and reads nothing but names and `lstat`s: never through
 * a link to a folder; a link to a file inside the open folder is that file; a link that leads
 * outside or nowhere, a FIFO, a socket, a device, a name that is not UTF-8 and, below the selection,
 * what D-10 hides are left out. It stops the moment either ceiling is passed, so the cost of a
 * refusal is the ceiling, never the folder (S-298).
 *
 * **The zip** ({@link archive}) is streamed by `yazl`, one file at a time: each is opened through
 * the fence only when its turn comes, and closed when it is done. A client that goes away is a
 * `close()` — the file being read is closed, the next is never opened (S-299). A file that vanished
 * or changed into something else since the walk destroys the stream: the zip is cut, never a valid
 * one with an entry missing.
 */
export class FolderArchive {
  constructor(
    private readonly fs: FolderFileSystem,
    private readonly fence: FolderFence,
  ) {}

  /** @throws {FileTooLargeError} past a ceiling — `measure` says which, `path` under which item */
  async survey(
    selection: readonly FilePath[],
    ceiling: CopyCeiling,
  ): Promise<readonly ArchiveSource[]> {
    const tally: Tally = { found: [], ceiling, bytes: 0 };

    for (const [index, selected] of selection.entries()) {
      await this.surveyed(tally, index, selected);
    }

    return tally.found;
  }

  archive(entries: readonly ArchiveEntry[]): OutgoingBytes {
    const zip = new ZipFile();
    const output = zip.outputStream as PassThrough;
    const state: { closed: boolean; reading: ReadStream | null } = { closed: false, reading: null };
    const cut = (error: Error): void => {
      output.destroy(error);
    };

    zip.on('error', cut);

    for (const entry of entries) {
      if (entry.kind === 'directory') {
        zip.addEmptyDirectory(entry.name, { mtime: entry.mtime, mode: entry.mode });
        continue;
      }

      zip.addReadStreamLazy(entry.name, { mtime: entry.mtime, mode: entry.mode }, (done) => {
        this.opened(entry, state.closed).then(
          (stream) => {
            state.reading = stream;
            stream.on('error', cut);
            done(null, stream);
          },
          (error: unknown) => {
            done(error, null as unknown as NodeJS.ReadableStream);
          },
        );
      });
    }

    zip.end();

    return {
      chunks: output,
      close: () => {
        state.closed = true;
        state.reading?.destroy();
        output.destroy();
        return Promise.resolve();
      },
    };
  }

  /** One item of the selection: a file, or a folder and everything the walk keeps under it. */
  private async surveyed(tally: Tally, index: number, selected: FilePath): Promise<void> {
    const real = await this.fence.realInside(selected);
    const stats = await this.fs.stat(real).catch((error: unknown) => {
      throw failureOf(selected, error);
    });

    if (!stats.isFile() && !stats.isDirectory()) {
      throw new FileNotAFileError(selected.relative);
    }

    counted(tally, selected, sourceOf(index, selected, stats));

    if (stats.isDirectory()) {
      await this.walked(tally, { selection: index, selected, directory: selected, real });
    }
  }

  private async walked(tally: Tally, place: Place): Promise<void> {
    for await (const dirent of await this.fs.opendir(place.real, { encoding: 'buffer' })) {
      const name = keptName(dirent.name as unknown as Buffer);

      if (name === null) {
        continue;
      }

      const real = posix.join(place.real, name);
      const stats = await this.followed(place.directory, real);

      if (stats === null) {
        continue;
      }

      const entry = place.directory.child(name);

      counted(tally, place.selected, sourceOf(place.selection, entry, stats));

      if (stats.isDirectory()) {
        await this.walked(tally, { ...place, directory: entry, real });
      }
    }
  }

  /**
   * What a child of a folder is to the zip: itself, when it is a file or a folder; the file it leads
   * to, for a link to a file inside the open folder; `null` for anything left out — and for what
   * vanished between the listing and the look, which Claude does all the time.
   */
  private async followed(directory: FilePath, real: string): Promise<Stats | null> {
    try {
      const own = await this.fs.lstat(real);

      if (own.isFile() || own.isDirectory()) {
        return own;
      }

      return own.isSymbolicLink() ? await this.linkedFile(directory, real) : null;
    } catch (error) {
      if (isAbsent(error)) {
        return null;
      }

      throw error;
    }
  }

  /** The file a link leads to, when it is a file inside the open folder — never a folder. */
  private async linkedFile(directory: FilePath, link: string): Promise<Stats | null> {
    // A loop or a broken link has no real path: left out, like one that leads outside.
    const target = await this.fs.realpath(link).catch(() => null);

    if (target === null || !FilePath.staysInside(directory.folder, target)) {
      return null;
    }

    const stats = await this.fs.stat(target);

    return stats.isFile() ? stats : null;
  }

  /** A file of the zip, opened through the fence when its turn comes — never once it was closed. */
  private async opened(entry: ArchiveEntry, closed: boolean): Promise<ReadStream> {
    if (closed) {
      throw new Error('the zip was closed before this entry was reached');
    }

    const real = await this.fence.realInside(entry.path);
    const handle = await this.fence.open(
      entry.path,
      real,
      constants.O_RDONLY | constants.O_NONBLOCK,
    );

    if (!(await handle.stat()).isFile()) {
      await handle.close();
      throw new FileNotAFileError(entry.path.relative);
    }

    // `autoClose`: the descriptor goes with the stream — at its end, or when it is destroyed.
    return handle.createReadStream();
  }
}

/** A name the zip keeps: UTF-8, addressable as a path, and not one D-10 hides. */
function keptName(bytes: Buffer): string | null {
  let name: string;

  try {
    name = strictUtf8.decode(bytes);
  } catch {
    return null;
  }

  return name.includes('\\') || HIDDEN_NAMES.includes(name) ? null : name;
}

function sourceOf(selection: number, path: FilePath, stats: Stats): ArchiveSource {
  const kind = stats.isDirectory() ? 'directory' : 'file';

  return {
    selection,
    path,
    kind,
    size: kind === 'file' ? stats.size : 0,
    mtime: stats.mtime,
    mode: stats.mode,
  };
}

/** Adds one entry, and refuses the moment either ceiling is passed. */
function counted(tally: Tally, selected: FilePath, source: ArchiveSource): void {
  tally.found.push(source);
  tally.bytes += source.size;

  if (tally.found.length > tally.ceiling.entries) {
    throw new FileTooLargeError(
      selected.relative,
      tally.found.length,
      tally.ceiling.entries,
      'entries',
    );
  }

  if (tally.bytes > tally.ceiling.bytes) {
    throw new FileTooLargeError(selected.relative, tally.bytes, tally.ceiling.bytes, 'bytes');
  }
}
