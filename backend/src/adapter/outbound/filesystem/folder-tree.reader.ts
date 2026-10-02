import { constants } from 'node:fs';
import type { Dirent, Stats } from 'node:fs';

import type { TreeRead } from '@application/files';
import { FileNotFoundError } from '@domain/files';
import type { EntryKind, FilePath, TargetKind, TreeChild } from '@domain/files';
import { WorkspaceDirectoryUnreadableError, WorkspaceNotADirectoryError } from '@domain/workspace';
import { codeOf, failureOf, isAbsent, kindOf } from './folder-file-system';
import type { FolderFileSystem } from './folder-file-system';
import type { FolderFence } from './folder-fence';

/** A name as the disk has it: bytes, which Linux does not require to be UTF-8. */
type ByteDirent = Dirent<Buffer>;

const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * One level of a folder, read through its descriptor — plan 07, B-08.
 *
 * Iterated, so the read **stops** at the ceiling and its cost is the ceiling, never the folder.
 * Each child costs an `lstat` (the tree shows size and date) and a link a `realpath` too; nothing is
 * ever opened, so a FIFO is listed as `other` and never blocks the listing (S-35). A child that
 * vanishes between the read and its `lstat` is left out without an error — Claude deletes files all
 * the time (S-36).
 */
export class FolderTreeReader {
  constructor(
    private readonly fs: FolderFileSystem,
    private readonly fence: FolderFence,
  ) {}

  async read(directory: FilePath, limit: number): Promise<TreeRead> {
    const real = await this.fence.realInside(directory);
    const handle = await this.openDirectory(directory, real);

    try {
      const base = await this.fence.descriptorPath(handle.fd, real);
      return await this.children(base, limit);
    } finally {
      await handle.close();
    }
  }

  private async openDirectory(
    directory: FilePath,
    real: string,
  ): Promise<Awaited<ReturnType<FolderFileSystem['open']>>> {
    return this.fence.open(
      directory,
      real,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NONBLOCK,
      { refuse: (error) => refusalOf(directory, error) },
    );
  }

  private async children(base: string, limit: number): Promise<TreeRead> {
    const children: TreeChild[] = [];

    // Leaving the loop early closes the handle: `for await` calls `return()` on the iterator.
    for await (const entry of await this.fs.opendir(base, { encoding: 'buffer' })) {
      const child = await this.childOf(base, entry as unknown as ByteDirent);

      if (child !== null) {
        children.push(child);
      }

      if (children.length >= limit) {
        return { children, exhausted: false };
      }
    }

    return { children, exhausted: true };
  }

  private async childOf(base: string, entry: ByteDirent): Promise<TreeChild | null> {
    const path = Buffer.concat([Buffer.from(`${base}/`), entry.name]);
    let stats: Stats;

    try {
      stats = await this.fs.lstat(path);
    } catch (error) {
      if (isAbsent(error)) {
        return null;
      }

      throw error;
    }

    const kind = kindOf(stats);

    return {
      ...nameOf(entry.name),
      kind,
      size: stats.size,
      mtime: stats.mtime,
      target: kind === 'symlink' ? await this.targetOf(path) : null,
    };
  }

  /** Where a link leads, and what is there; `missing` for a broken one, a loop, or a closed one. */
  private async targetOf(link: Buffer): Promise<NonNullable<TreeChild['target']>> {
    try {
      const realPath = await this.fs.realpath(link);
      const kind = kindOf(await this.fs.stat(realPath)) as Exclude<EntryKind, 'symlink'>;

      return { realPath, kind };
    } catch {
      return { realPath: null, kind: 'missing' satisfies TargetKind };
    }
  }
}

/** The name as text — marked, and never operated on, when it is not UTF-8 (S-37). */
function nameOf(bytes: Buffer): { readonly name: string; readonly unreadableName: boolean } {
  try {
    return { name: strictUtf8.decode(bytes), unreadableName: false };
  } catch {
    return { name: bytes.toString('utf8'), unreadableName: true };
  }
}

/**
 * A folder that cannot be listed, in the terms of the picker of plan 06: a file is
 * `WORKSPACE_NOT_A_DIRECTORY` (S-31), a folder this process may not read is
 * `WORKSPACE_DIRECTORY_UNREADABLE` (S-33, decided on 2026-09-30), nothing there is `FILE_NOT_FOUND`
 * (S-32).
 */
function refusalOf(directory: FilePath, error: unknown): unknown {
  switch (codeOf(error)) {
    case 'ENOTDIR':
      return new WorkspaceNotADirectoryError(directory.absolute);
    case 'EACCES':
    case 'EPERM':
      return new WorkspaceDirectoryUnreadableError(directory.absolute);
    case 'ENOENT':
      return new FileNotFoundError(directory.relative);
    default:
      return failureOf(directory, error);
  }
}
