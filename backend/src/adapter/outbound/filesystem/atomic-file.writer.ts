import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import type { Stats } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { posix } from 'node:path';
import { ulid } from 'ulid';

import type { ChunkSource, WriteGuard, WrittenFile } from '@application/files';
import { Etag, FileNotFoundError, UploadSizeMismatchError } from '@domain/files';
import type { FilePath } from '@domain/files';
import { codeOf, failureOf, isAbsent } from './folder-file-system';
import type { FolderFileSystem } from './folder-file-system';
import type { FolderFence } from './folder-fence';

/**
 * A temporary of ours: `.<name>.rc-<ulid>.tmp`, beside the file it will replace. Recognisable, so
 * the one a process left behind when it died can be told from anybody else's file (S-70).
 */
const TEMPORARY = /^\..+\.rc-[0-9A-HJKMNP-TV-Z]{26}\.tmp$/;

/** A file of ours beside the one it serves — a temporary, or the backup of an in-place write. */
const SIDE_FILE = /^\..+\.rc-[0-9A-HJKMNP-TV-Z]{26}\.(tmp|bak)$/;

/**
 * Whether a name is one of the files a write of ours puts beside its target for an instant. The
 * watcher leaves them out: a save is one `changed` of the file saved, never a temporary that
 * appears and goes (plan 07, B-20).
 */
export function isSideFile(name: string): boolean {
  return SIDE_FILE.test(name);
}

/**
 * How much of the name a temporary keeps. The rest of it — the dot, `.rc-`, the ULID and the
 * extension — takes 35 bytes, and a name may take 255, which a filesystem will not hold whole.
 */
const NAME_IN_TEMPORARY_BYTES = 200;

/** How much of a file is read at a time, to hash it or to bound a read. */
export const CHUNK_BYTES = 64 * 1024;

/** The mode a new file is created with: what `touch` gives, before the person's umask is ignored. */
export const NEW_FILE_MODE = 0o666;

/** How many entries of a folder are looked at for orphan temporaries — a folder of ours is small. */
const SWEEP_LIMIT = 10_000;

/**
 * Writes the person's bytes to the disk without ever leaving a file half-written — plan 07, B-11.
 *
 * The same discipline as the undo's restore (docs/architecture/backend/04-claude-integration.md):
 * a temporary in the **same folder** as the real file, `fsync`, the mode of the original kept, the
 * descriptor of the temporary checked to be inside the open folder, the version on disk checked
 * once more, and a `rename` — atomic within one filesystem, so a failure at any step leaves the
 * original exactly as it was and no temporary behind (S-69, S-71).
 *
 * A file with other hard links is written **in place** instead, from a copy kept beside it until
 * the write is done: a `rename` would give this name a new inode and leave the others with the old
 * contents, in silence ([07 · D-05](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-05--symlinks-e-hard-links), S-75).
 */
export class AtomicFileWriter {
  /** Temporaries being written right now — never swept from under their own write. */
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly fs: FolderFileSystem,
    private readonly fence: FolderFence,
  ) {}

  /**
   * Replaces a file's contents. A link inside the open folder is written through: the target
   * changes, the link stays (S-74).
   */
  async replace(file: FilePath, bytes: Uint8Array, guard: WriteGuard): Promise<WrittenFile> {
    const { real, original } = await this.replaceable(file, guard);

    return original.nlink > 1
      ? this.inPlace(file, real, (handle) => handle.writeFile(bytes), guard)
      : this.renamed(file, real, bytes, guard, original.mode & 0o7777);
  }

  /**
   * Replaces a file with a temporary {@link stage} already filled — an upload's `replace`: the
   * same guard right before the `rename`, the same write in place for a file with hard links. The
   * temporary is the caller's to {@link discard}, whatever happens.
   */
  async replaceStaged(file: FilePath, temporary: string, guard: WriteGuard): Promise<WrittenFile> {
    const { real, original } = await this.replaceable(file, guard);

    return original.nlink > 1
      ? this.inPlace(file, real, (handle) => this.copyInto(file, temporary, handle), guard)
      : this.renameOver(file, real, temporary, guard);
  }

  /**
   * Fills a temporary for `entry` in `folder` with exactly `size` bytes of `source`, hashing them as
   * they come, never holding them whole — an upload's part (plan 07, B-49). One byte more than
   * declared and the part is cut; one fewer — the connection dropped, the body ended — and it is
   * refused; either way the temporary is gone before the refusal leaves.
   *
   * @param mode the mode the file will have: the one it replaces, or a new file's
   * @throws {UploadSizeMismatchError} the source did not carry `size` bytes
   */
  async stage(
    entry: FilePath,
    folder: string,
    source: ChunkSource,
    size: number,
    mode: number,
  ): Promise<{ readonly temporary: string; readonly etag: Etag }> {
    const hash = createHash('sha256');
    const temporary = await this.temporaryFilled(entry, folder, mode, async (handle) => {
      let received = 0;

      for (let chunk = await source.next(); chunk !== null; chunk = await source.next()) {
        received += chunk.length;

        if (received > size) {
          throw new UploadSizeMismatchError(entry.relative, size, received);
        }

        hash.update(chunk);
        await handle.writeFile(chunk);
      }

      if (received < size) {
        throw new UploadSizeMismatchError(entry.relative, size, received);
      }
    });

    return { temporary, etag: Etag.ofDigest(hash.digest('hex')) };
  }

  /**
   * Puts a filled temporary at `entry` by a `link`, which fails if anything is there — creating the
   * folders above that are missing, one at a time, through the fence. The temporary stays, for the
   * caller to {@link discard}.
   */
  async place(entry: FilePath, temporary: string): Promise<WrittenFile> {
    const target = posix.join(await this.fence.ensureFolders(entry.parent()), entry.name);

    await this.linked(entry, temporary, target);
    return measured(await this.fs.stat(target));
  }

  /** The file a replace is about to replace, and what it is now — gone is the guard's to judge. */
  private async replaceable(
    file: FilePath,
    guard: WriteGuard,
  ): Promise<{ readonly real: string; readonly original: Stats }> {
    let real: string;

    try {
      real = await this.fence.realInside(file);
    } catch (error) {
      // Gone since the use case looked: the guard says what that means — a save never re-creates.
      if (error instanceof FileNotFoundError) {
        guard(null);
      }

      throw error;
    }

    await this.probeWritable(file, real);

    return { real, original: await this.fs.lstat(real) };
  }

  /**
   * Creates a file with `bytes` where nothing is: written to a temporary, then **linked** to its
   * name, which fails if anything took the name meanwhile — atomic, and never over anything (S-85).
   *
   * @param folder the real path of the folder it goes in, already inside the open folder
   */
  async create(entry: FilePath, folder: string, bytes: Uint8Array): Promise<void> {
    const temporary = await this.temporaryWith(entry, folder, bytes, NEW_FILE_MODE);

    try {
      await this.linked(entry, temporary, posix.join(folder, entry.name));
    } finally {
      await this.discard(temporary);
    }
  }

  /** The version of a regular file, hashed as a stream; `null` for anything else or nothing. */
  async version(file: FilePath): Promise<Etag | null> {
    let real: string;

    try {
      real = await this.fence.realInside(file);
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        return null;
      }

      throw error;
    }

    return this.versionAt(file, real);
  }

  /**
   * Whether the file itself may be written — asked of the operating system by opening it for
   * writing, and nothing more.
   *
   * A `rename` needs only the folder's permission, so without this a file marked read-only would be
   * replaced without a word; the person sees it refused instead, as the editor they know does
   * (S-77). Opening is the honest question: it answers for ACLs and read-only mounts too.
   */
  private async probeWritable(file: FilePath, real: string): Promise<void> {
    const handle = await this.fence.open(file, real, constants.O_WRONLY | constants.O_NONBLOCK);
    await handle.close();
  }

  private async renamed(
    file: FilePath,
    real: string,
    bytes: Uint8Array,
    guard: WriteGuard,
    mode: number,
  ): Promise<WrittenFile> {
    const folder = posix.dirname(real);

    await this.sweep(folder);
    const temporary = await this.temporaryWith(file, folder, bytes, mode);

    try {
      return await this.renameOver(file, real, temporary, guard);
    } finally {
      await this.discard(temporary);
    }
  }

  /** The guard, with the version on disk right now, and the `rename` that makes the write. */
  private async renameOver(
    file: FilePath,
    real: string,
    temporary: string,
    guard: WriteGuard,
  ): Promise<WrittenFile> {
    try {
      guard(await this.versionAt(file, real));
      await this.fs.rename(temporary, real);
      return measured(await this.fs.stat(real));
    } catch (error) {
      throw failureOf(file, error);
    }
  }

  /** A hard link from a temporary to the name it was for — `EEXIST` when the name is taken. */
  private async linked(entry: FilePath, temporary: string, target: string): Promise<void> {
    try {
      await this.fs.link(temporary, target);
    } catch (error) {
      throw failureOf(entry, error);
    }
  }

  private async inPlace(
    file: FilePath,
    real: string,
    fill: (handle: FileHandle) => Promise<void>,
    guard: WriteGuard,
  ): Promise<WrittenFile> {
    const backup = posix.join(posix.dirname(real), sideName(posix.basename(real), 'bak'));

    await this.fs.copyFile(real, backup, constants.COPYFILE_EXCL).catch((error: unknown) => {
      throw failureOf(file, error);
    });

    try {
      guard(await this.versionAt(file, real));
      await this.overwrite(file, real, fill);
    } catch (error) {
      await this.restore(backup, real);
      throw failureOf(file, error);
    } finally {
      await this.fs.rm(backup, { recursive: false, force: true });
    }

    return measured(await this.fs.stat(real));
  }

  /** Writes over a file's own inode — what keeps its hard links pointing at the new contents. */
  private async overwrite(
    file: FilePath,
    real: string,
    fill: (handle: FileHandle) => Promise<void>,
  ): Promise<void> {
    const handle = await this.fence.open(file, real, constants.O_WRONLY | constants.O_TRUNC);

    try {
      await fill(handle);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  /** Puts the backup's contents back, over the same inode. Best effort: the backup stays if it fails. */
  private async restore(backup: string, real: string): Promise<void> {
    await this.fs.copyFile(backup, real, 0);
  }

  /** Copies a filled temporary into an open file, a chunk at a time. */
  private async copyInto(file: FilePath, temporary: string, into: FileHandle): Promise<void> {
    const from = await this.fence.open(file, temporary, constants.O_RDONLY);
    const chunk = Buffer.alloc(CHUNK_BYTES);

    try {
      for (;;) {
        const { bytesRead } = await from.read(chunk, 0, CHUNK_BYTES, null);

        if (bytesRead === 0) {
          return;
        }

        await into.writeFile(chunk.subarray(0, bytesRead));
      }
    } finally {
      await from.close();
    }
  }

  /** A temporary beside the target holding `bytes`. */
  private temporaryWith(
    entry: FilePath,
    folder: string,
    bytes: Uint8Array,
    mode: number,
  ): Promise<string> {
    return this.temporaryFilled(entry, folder, mode, (handle) => handle.writeFile(bytes));
  }

  /**
   * A temporary beside the target, filled by `fill`, flushed to the disk, with `mode` — set after
   * the open, because the mode an `open` creates with is cut by the process's umask.
   */
  private async temporaryFilled(
    entry: FilePath,
    folder: string,
    mode: number,
    fill: (handle: FileHandle) => Promise<void>,
  ): Promise<string> {
    const temporary = posix.join(folder, sideName(entry.name, 'tmp'));
    this.inFlight.add(temporary);

    let handle: FileHandle | null = null;

    try {
      handle = await this.fence.open(
        entry,
        temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
        { mode },
      );
      await fill(handle);
      await handle.chmod(mode);
      await handle.sync();
      return temporary;
    } catch (error) {
      await this.discard(temporary);
      throw failureOf(entry, error);
    } finally {
      await handle?.close();
    }
  }

  /** Removes a temporary of ours, whatever state it is in — or nothing, once it is gone. */
  async discard(temporary: string): Promise<void> {
    this.inFlight.delete(temporary);
    await this.fs.rm(temporary, { recursive: false, force: true });
  }

  /**
   * The version on disk at `real`, as the guard is asked about it — a link where a file was is a
   * swap, and refused rather than written over (S-78).
   */
  private async versionAt(file: FilePath, real: string): Promise<Etag | null> {
    let handle: FileHandle;

    try {
      handle = await this.fence.open(file, real, constants.O_RDONLY | constants.O_NONBLOCK);
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        return null;
      }

      throw error;
    }

    try {
      return (await handle.stat()).isFile() ? await digestOf(handle) : null;
    } finally {
      await handle.close();
    }
  }

  /**
   * Removes the temporaries a process that died left in a folder — the next write there is when
   * (S-70). Never one being written right now, and never a backup of an in-place write, which may
   * be the only copy of a file whose write was cut short.
   */
  private async sweep(folder: string): Promise<void> {
    let seen = 0;

    try {
      for await (const entry of await this.fs.opendir(folder, { encoding: 'buffer' })) {
        const name = String(entry.name);
        const path = posix.join(folder, name);

        if (TEMPORARY.test(name) && !this.inFlight.has(path)) {
          await this.fs.rm(path, { recursive: false, force: true });
        }

        seen += 1;

        if (seen >= SWEEP_LIMIT) {
          return;
        }
      }
    } catch (error) {
      // A folder that cannot be listed is reported by the write itself, a moment later.
      if (!isAbsent(error) && codeOf(error) !== 'EACCES') {
        throw error;
      }
    }
  }
}

/**
 * The SHA-256 of everything an open file holds, read a chunk at a time from where its position is —
 * the start, for a descriptor no sequential read has moved.
 */
export async function digestOf(handle: FileHandle): Promise<Etag> {
  const hash = createHash('sha256');
  const chunk = Buffer.alloc(CHUNK_BYTES);

  for (;;) {
    const { bytesRead } = await handle.read(chunk, 0, CHUNK_BYTES, null);

    if (bytesRead === 0) {
      return Etag.ofDigest(hash.digest('hex'));
    }

    hash.update(chunk.subarray(0, bytesRead));
  }
}

/** The name of a file of ours beside `name`: a temporary, or the backup of an in-place write. */
function sideName(name: string, kind: 'tmp' | 'bak'): string {
  const kept = Buffer.from(name).subarray(0, NAME_IN_TEMPORARY_BYTES).toString('utf8');

  return `.${kept}.rc-${ulid()}.${kind}`;
}

function measured(stats: { readonly size: number; readonly mtime: Date }): WrittenFile {
  return { size: stats.size, mtime: stats.mtime };
}
