import { constants } from 'node:fs';
import type { Stats } from 'node:fs';
import { posix } from 'node:path';

import type { CopyCeiling } from '@application/files';
import { FileNotAFileError, FileTooLargeError } from '@domain/files';
import type { FilePath } from '@domain/files';
import { failureOf } from './folder-file-system';
import type { FolderFileSystem } from './folder-file-system';

/** What a copy would carry. */
interface Measure {
  entries: number;
  bytes: number;
}

/**
 * Copies a file or a folder of the open folder — plan 07, B-14.
 *
 * Never through a link: a link is copied **as a link** (`readlink` + `symlink`), so a link to
 * `/etc` inside the folder copies the link and not `/etc` (S-101). A FIFO, a socket or a device
 * inside a folder is left out — copying one would read it. The ceiling is measured **before** the
 * first byte (S-104), and a copy that fails halfway removes what it had made — never a destination
 * that was already there (S-105).
 */
export class FolderEntryCopier {
  constructor(private readonly fs: FolderFileSystem) {}

  /**
   * @param from where the source is, not followed — the fence's own path of it
   * @param to where the copy goes, inside a folder the fence already resolved
   */
  async copy(source: FilePath, from: string, to: string, ceiling: CopyCeiling): Promise<void> {
    const stats = await this.fs.lstat(from).catch((error: unknown) => {
      throw failureOf(source, error);
    });

    if (!stats.isFile() && !stats.isDirectory() && !stats.isSymbolicLink()) {
      throw new FileNotAFileError(source.relative);
    }

    await this.within(source, from, stats, ceiling);

    let started = false;

    try {
      await this.copyEntry(from, to, stats, () => {
        started = true;
      });
    } catch (error) {
      if (started) {
        await this.fs.rm(to, { recursive: true, force: true });
      }

      throw failureOf(source, error);
    }
  }

  /** @throws {FileTooLargeError} past the ceiling, in entries or in bytes */
  private async within(
    source: FilePath,
    from: string,
    stats: Stats,
    ceiling: CopyCeiling,
  ): Promise<void> {
    const measure: Measure = { entries: 0, bytes: 0 };

    await this.measure(from, stats, measure, ceiling);

    if (measure.entries > ceiling.entries) {
      throw new FileTooLargeError(source.relative, measure.entries, ceiling.entries, 'entries');
    }

    if (measure.bytes > ceiling.bytes) {
      throw new FileTooLargeError(source.relative, measure.bytes, ceiling.bytes, 'bytes');
    }
  }

  /** Adds up an entry, and stops walking as soon as either ceiling is passed. */
  private async measure(
    path: string,
    stats: Stats,
    measure: Measure,
    ceiling: CopyCeiling,
  ): Promise<void> {
    measure.entries += 1;
    measure.bytes += stats.isFile() ? stats.size : 0;

    if (
      !stats.isDirectory() ||
      measure.entries > ceiling.entries ||
      measure.bytes > ceiling.bytes
    ) {
      return;
    }

    for await (const entry of await this.fs.opendir(path, { encoding: 'buffer' })) {
      const child = posix.join(path, String(entry.name));

      await this.measure(child, await this.fs.lstat(child), measure, ceiling);

      if (measure.entries > ceiling.entries || measure.bytes > ceiling.bytes) {
        return;
      }
    }
  }

  /**
   * One entry, and everything under it.
   *
   * @param created called once the entry itself exists at `to` — from then on, a failure has
   *   something of ours to remove
   */
  private async copyEntry(
    from: string,
    to: string,
    stats: Stats,
    created: () => void = () => undefined,
  ): Promise<void> {
    if (stats.isSymbolicLink()) {
      await this.fs.symlink(await this.fs.readlink(from), to);
      created();
      return;
    }

    if (stats.isFile()) {
      await this.fs.copyFile(from, to, constants.COPYFILE_EXCL);
      created();
      return;
    }

    if (stats.isDirectory()) {
      await this.fs.mkdir(to);
      created();
      await this.copyChildren(from, to);
    }
  }

  private async copyChildren(from: string, to: string): Promise<void> {
    for await (const entry of await this.fs.opendir(from, { encoding: 'buffer' })) {
      const name = String(entry.name);
      const child = posix.join(from, name);

      await this.copyEntry(child, posix.join(to, name), await this.fs.lstat(child));
    }
  }
}
