import { constants } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { posix } from 'node:path';

import { FilePath, FileNotFoundError } from '@domain/files';
import { WorkspaceNotAllowedError } from '@domain/workspace';
import { codeOf, failureOf, isAbsent } from './folder-file-system';
import type { FolderFileSystem } from './folder-file-system';

/** Where Linux says what an open descriptor really is. */
const DESCRIPTORS = '/proc/self/fd';

/**
 * The half of the containment that needs the disk — plan 07, B-07.
 *
 * {@link FilePath} refused, without I/O, everything a string can say is outside the open folder.
 * What a string cannot say is where a **link** leads, so every operation asks again, here:
 *
 * 1. the `realpath` of what it touches — or, for what does not exist yet, of the nearest folder
 *    above it that does — has to stay inside the open folder. A link is followed only when it does
 *    ([07 · D-05](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-05--symlinks-e-hard-links));
 * 2. what it then opens is checked **on the descriptor**: `/proc/self/fd/<fd>` says what was really
 *    opened, so a folder swapped for a link between step 1 and the `open` is caught here, and
 *    nothing is read or written (S-25, S-78);
 * 3. links that lead back to themselves (`ELOOP`) are refused, never followed for ever (S-24).
 *
 * Nothing is cached: no "this folder was checked already". The descriptor check is Linux-only —
 * where there is no `/proc`, step 2 is skipped, which is the gap plan 17 owns (R-02).
 */
export class FolderFence {
  constructor(private readonly fs: FolderFileSystem) {}

  /**
   * The real path of an entry that exists, following links that stay inside.
   *
   * @throws {WorkspaceNotAllowedError} it, or a folder on the way to it, leads outside (S-22, S-23)
   * @throws {FileNotFoundError} nothing is there
   */
  async realInside(entry: FilePath): Promise<string> {
    let real: string;

    try {
      real = await this.fs.realpath(entry.absolute);
    } catch (error) {
      throw failureOf(entry, error);
    }

    return this.inside(entry, real);
  }

  /**
   * Where an entry is, **without following it** when it is itself a link: the real path of the
   * folder it is in, and its name. What a link is removed, inspected or moved by (S-113).
   */
  async ownPath(entry: FilePath): Promise<string> {
    return entry.isFolder
      ? this.realInside(entry)
      : posix.join(await this.whereWouldBe(entry.parent()), entry.name);
  }

  /**
   * Where an entry is or would be: its real path when it exists, or the real path of the nearest
   * folder above it that does, with the rest of the path after it.
   */
  async whereWouldBe(entry: FilePath): Promise<string> {
    try {
      return await this.realInside(entry);
    } catch (error) {
      if (!(error instanceof FileNotFoundError) || entry.isFolder) {
        throw error;
      }

      return posix.join(await this.whereWouldBe(entry.parent()), entry.name);
    }
  }

  /**
   * The real path of the nearest folder at or above `directory` that exists — where the bytes of
   * something about to be created under folders not made yet wait, so the folders themselves are
   * only made once the trail has been told (07 · B-49).
   */
  async nearestFolder(directory: FilePath): Promise<string> {
    for (let at = directory; ; at = at.parent()) {
      const real = await this.existingOrNull(at);

      if (real !== null) {
        return real;
      }
    }
  }

  /** The real path of an entry, `null` when nothing is there — the open folder is always there. */
  private async existingOrNull(entry: FilePath): Promise<string | null> {
    try {
      return await this.realInside(entry);
    } catch (error) {
      if (error instanceof FileNotFoundError && !entry.isFolder) {
        return null;
      }

      throw error;
    }
  }

  /**
   * The real path a lock is taken on: a link inside the open folder is the file it leads to; one
   * that leads outside — or nowhere — is only itself.
   */
  async locate(entry: FilePath): Promise<string> {
    const own = await this.ownPath(entry);

    try {
      const real = await this.fs.realpath(own);

      return FilePath.staysInside(entry.folder, real) ? real : own;
    } catch {
      // A broken link, a loop, or nothing there yet: the entry is where it would be.
      return own;
    }
  }

  /**
   * Creates the folders above an entry that are missing, one at a time, each inside the open
   * folder — never `mkdir -p` on a string, which would follow a link on the way (S-83).
   */
  async ensureFolders(directory: FilePath): Promise<string> {
    try {
      return await this.realInside(directory);
    } catch (error) {
      if (!(error instanceof FileNotFoundError) || directory.isFolder) {
        throw error;
      }
    }

    const parent = await this.ensureFolders(directory.parent());

    try {
      await this.fs.mkdir(posix.join(parent, directory.name));
    } catch (error) {
      // Made by somebody else in between is what was wanted; anything else is a refusal.
      if (codeOf(error) !== 'EEXIST') {
        throw failureOf(directory, error);
      }
    }

    return this.realInside(directory);
  }

  /**
   * Opens a path the fence already resolved, without following a link at its end, and checks what
   * was really opened.
   *
   * @param real a real path, from {@link realInside} or {@link ownPath}
   * @param options the mode of a file it creates, and what a refusal of the `open` means — the
   *   module's table unless the caller says otherwise
   * @throws {WorkspaceNotAllowedError} it changed into a link, or the descriptor is outside (S-25)
   */
  async open(
    entry: FilePath,
    real: string,
    flags: number,
    options: {
      readonly mode?: number;
      readonly refuse?: (error: unknown) => unknown;
    } = {},
  ): Promise<FileHandle> {
    let handle: FileHandle;

    try {
      handle = await this.fs.open(real, flags | constants.O_NOFOLLOW, options.mode);
    } catch (error) {
      // The path resolved a moment ago with no link at its end; one there now was put there since.
      if (codeOf(error) === 'ELOOP') {
        throw new WorkspaceNotAllowedError(entry.absolute);
      }

      throw (options.refuse ?? ((cause: unknown) => failureOf(entry, cause)))(error);
    }

    try {
      await this.checkDescriptor(entry, handle.fd);
      return handle;
    } catch (error) {
      await handle.close();
      throw error;
    }
  }

  /** The path to read a directory through: its descriptor where Linux has one, else its real path. */
  async descriptorPath(fd: number, fallback: string): Promise<string> {
    const path = posix.join(DESCRIPTORS, String(fd));

    try {
      await this.fs.readlink(path);
      return path;
    } catch {
      return fallback;
    }
  }

  /** @throws {WorkspaceNotAllowedError} the descriptor is of something outside the open folder */
  private async checkDescriptor(entry: FilePath, fd: number): Promise<void> {
    let real: string;

    try {
      real = await this.fs.readlink(posix.join(DESCRIPTORS, String(fd)));
    } catch (error) {
      // No `/proc` — not Linux, or not mounted. The check that remains is step 1 (R-02).
      if (isAbsent(error)) {
        return;
      }

      throw error;
    }

    this.inside(entry, real);
  }

  private inside(entry: FilePath, real: string): string {
    if (!FilePath.staysInside(entry.folder, real)) {
      throw new WorkspaceNotAllowedError(entry.absolute);
    }

    return real;
  }
}
