import type { UserId } from '@domain/auth';
import { FilePath, listTree } from '@domain/files';
import type { TreeListing } from '@domain/files';
import type { FileLimits } from './file-limits';
import type { FolderDisk } from './ports/folder-disk.port';
import type { FolderResolver } from './ports/folder-resolver.port';

/** What the explorer asks for: one directory of one open folder. */
export interface ListTreeQuery {
  readonly folder: string;
  /** Relative to the folder; `''` is the folder itself. */
  readonly path: string;
}

/**
 * One level of the tree of an open folder — plan 07, B-08.
 *
 * The order is the fence's: the folder through `workspace` (allowlist, disk, real path — at every
 * call), the path through {@link FilePath} (before any I/O), then the disk, which checks the real
 * path again. One level, on demand, never more than the ceiling: the port stops reading at one past
 * it, which is what tells "exactly the ceiling" from "more than it" (S-30).
 */
export class ListTreeUseCase {
  constructor(
    private readonly folders: FolderResolver,
    private readonly disk: FolderDisk,
    private readonly limits: Pick<FileLimits, 'treeEntries'>,
  ) {}

  async execute(query: ListTreeQuery, userId: UserId): Promise<TreeListing> {
    const directory = FilePath.create(await this.folders.resolve(query.folder, userId), query.path);
    const read = await this.disk.list(directory, this.limits.treeEntries + 1);

    return listTree({
      directory,
      children: read.children,
      exhausted: read.exhausted,
      limit: this.limits.treeEntries,
    });
  }
}
