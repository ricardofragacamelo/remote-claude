import { Inject, Injectable } from '@nestjs/common';
import { lstat, opendir, realpath, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';

import type { DirectoryRead, WorkspaceDirectoryLister } from '@application/workspace';
import type { DirectoryChild, DirectoryListingCriteria } from '@domain/workspace';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { codeOf } from './folder-file-system';

/** The four calls the lister makes, so a test can stand in for a filesystem it cannot build. */
export interface ListerFileSystem {
  opendir(path: string): Promise<AsyncIterable<Dirent>>;
  lstat(path: string): Promise<{ isDirectory(): boolean; isSymbolicLink(): boolean }>;
  realpath(path: string): Promise<string>;
  stat(path: string): Promise<{ isDirectory(): boolean }>;
}

const nodeFileSystem: ListerFileSystem = { opendir, lstat, realpath, stat };

/** Why opening the directory failed, as what the caller can answer about it. */
const OPEN_FAILURES: Readonly<Record<string, Exclude<DirectoryRead['kind'], 'read'>>> = {
  ENOENT: 'missing',
  ENOTDIR: 'notADirectory',
  EACCES: 'unreadable',
  EPERM: 'unreadable',
};

/**
 * Failures that mean "this link leads nowhere we can list", and nothing worse: a broken link, a
 * loop, a target that vanished between the read and the resolution, or one we may not look at.
 */
const DEAD_LINK = new Set(['ENOENT', 'ENOTDIR', 'ELOOP', 'EACCES', 'EPERM']);

/**
 * One level of a directory, read with `fs.opendir`.
 *
 * `opendir` and not `readdir`: it is iterated, so the read **stops** once the ceiling is passed and
 * the cost of a listing is the ceiling, never the directory. `Dirent` tells the type without a
 * `stat` for the ordinary entry; only a symlink costs a `realpath` — the domain needs to know
 * where it leads — and an entry whose type the filesystem did not report costs an `lstat`.
 *
 * The log carries the path, the count, whether the read was cut and how long it took — **never**
 * the names: a listing in the log is a map of the machine in the log
 * (docs/architecture/shared/03-logging.md#a-regra-do-io-em-debug).
 */
@Injectable()
export class NodeWorkspaceDirectoryLister implements WorkspaceDirectoryLister {
  constructor(
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly fs: ListerFileSystem = nodeFileSystem,
  ) {}

  async read(
    path: string,
    criteria: DirectoryListingCriteria,
    limit: number,
  ): Promise<DirectoryRead> {
    const startedAt = Date.now();
    this.logger.debug({ op: 'fs.list', layer: 'adapter', path, limit }, 'listing a directory');

    const read = await this.readDirectory(path, criteria, limit);

    this.logger.debug(
      {
        op: 'fs.listed',
        layer: 'adapter',
        path,
        kind: read.kind,
        count: read.kind === 'read' ? read.children.length : 0,
        truncated: read.kind === 'read' && !read.exhausted,
        durationMs: Date.now() - startedAt,
      },
      'directory listed',
    );

    return read;
  }

  private async readDirectory(
    path: string,
    criteria: DirectoryListingCriteria,
    limit: number,
  ): Promise<DirectoryRead> {
    let directory: AsyncIterable<Dirent>;

    try {
      directory = await this.fs.opendir(path);
    } catch (error) {
      const kind = OPEN_FAILURES[codeOf(error)];

      if (kind !== undefined) {
        return { kind };
      }

      this.logger.error({ op: 'fs.listed', layer: 'adapter', path, err: error }, 'cannot list');
      throw error;
    }

    const children: DirectoryChild[] = [];

    // Leaving the loop early closes the handle: `for await` calls `return()` on the iterator.
    for await (const entry of directory) {
      if (!criteria.admits(entry.name)) {
        continue;
      }

      const child = await this.childOf(path, entry);

      if (child === null) {
        continue;
      }

      children.push(child);

      if (children.length >= limit) {
        return { kind: 'read', children, exhausted: false };
      }
    }

    return { kind: 'read', children, exhausted: true };
  }

  /** A directory, a symlink with where it leads, or `null` for anything that cannot be listed. */
  private async childOf(parent: string, entry: Dirent): Promise<DirectoryChild | null> {
    const path = join(parent, entry.name);
    const type = hasType(entry) ? entry : await this.typeOf(path);

    if (type === null) {
      return null;
    }

    if (type.isSymbolicLink()) {
      return { kind: 'symlink', name: entry.name, target: await this.targetOf(path) };
    }

    return type.isDirectory() ? { kind: 'directory', name: entry.name } : null;
  }

  /** The type of an entry the filesystem reported without one; `null` once it is gone. */
  private async typeOf(
    path: string,
  ): Promise<{ isDirectory(): boolean; isSymbolicLink(): boolean } | null> {
    try {
      return await this.fs.lstat(path);
    } catch (error) {
      return this.deadEnd(path, error);
    }
  }

  /** The real path of a link's target when that target is a directory, and `null` otherwise. */
  private async targetOf(link: string): Promise<string | null> {
    try {
      const target = await this.fs.realpath(link);
      return (await this.fs.stat(target)).isDirectory() ? target : null;
    } catch (error) {
      return this.deadEnd(link, error);
    }
  }

  /**
   * An entry that cannot be listed — omitted, and the listing goes on.
   *
   * The expected failures (gone, looping, not ours to look at) are the ordinary life of a directory
   * other processes write to. Anything else is still omitted, because failing closed here means not
   * listing, but it is logged: a failure nobody sees is a failure nobody fixes.
   */
  private deadEnd(path: string, error: unknown): null {
    if (!DEAD_LINK.has(codeOf(error))) {
      this.logger.warn(
        { op: 'fs.listed', layer: 'adapter', path, err: error },
        'an entry could not be inspected and was left out',
      );
    }

    return null;
  }
}

/**
 * Whether the filesystem reported the entry's type. Some (network mounts, a few FUSE drivers)
 * report none, and every `is…()` of the `Dirent` then answers `false`.
 */
function hasType(entry: Dirent): boolean {
  return (
    entry.isDirectory() ||
    entry.isSymbolicLink() ||
    entry.isFile() ||
    entry.isFIFO() ||
    entry.isSocket() ||
    entry.isBlockDevice() ||
    entry.isCharacterDevice()
  );
}
