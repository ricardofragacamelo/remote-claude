import type { UserId } from '@domain/auth';
import {
  DIRECTORY_LISTING_LIMIT,
  DirectoryListingCriteria,
  listDirectory,
  WorkspaceDirectoryUnreadableError,
  WorkspaceNotADirectoryError,
  WorkspaceNotFoundError,
} from '@domain/workspace';
import type { DirectoryListing } from '@domain/workspace';
import type { WorkspaceAllowlistSource } from './ports/workspace-allowlist.port';
import type { WorkspaceDirectoryLister } from './ports/workspace-directory.lister';
import type { WorkspaceDirectoryProbe } from './ports/workspace-directory.probe';
import { resolveFolder } from './resolve-folder';

/** What the picker asks for: one directory, and how to narrow it. */
export interface ListDirectoriesQuery {
  readonly path: string;
  /** List names starting with `.` too. */
  readonly hidden: boolean;
  /** Only names starting with this, ignoring case; `null` for all of them. */
  readonly prefix: string | null;
}

/**
 * The subdirectories of one folder of this user — the first route of this module that reads a
 * directory, and it does so only in these terms: one level, on demand, directories only, inside the
 * allowlist, never more than the ceiling (docs/architecture/backend/03-modules.md#workspace).
 *
 * The order is {@link resolveFolder}'s four checks, then the read. The allowlist is read at every
 * call, never captured here: it is reloadable, and a root removed from it is refused by the very
 * next listing (plan 06, S-32).
 */
export class ListDirectoriesUseCase {
  constructor(
    private readonly allowlist: WorkspaceAllowlistSource,
    private readonly directories: WorkspaceDirectoryProbe,
    private readonly lister: WorkspaceDirectoryLister,
    private readonly limit: number = DIRECTORY_LISTING_LIMIT,
  ) {}

  /**
   * @throws whatever {@link resolveFolder} refuses the path with
   * @throws {WorkspaceNotFoundError} the directory vanished between the check and the read
   * @throws {WorkspaceNotADirectoryError} it was replaced by a file in between
   * @throws {WorkspaceDirectoryUnreadableError} this process may not read it
   */
  async execute(query: ListDirectoriesQuery, userId: UserId): Promise<DirectoryListing> {
    const { path, workspace } = await resolveFolder(
      this.allowlist.current(),
      this.directories,
      query.path,
      userId,
    );
    const criteria = new DirectoryListingCriteria(query.hidden, query.prefix);

    // One past the ceiling: that is what tells "exactly the ceiling" from "more than it".
    const read = await this.lister.read(path.value, criteria, this.limit + 1);

    switch (read.kind) {
      case 'missing':
        throw new WorkspaceNotFoundError(path.value);
      case 'notADirectory':
        throw new WorkspaceNotADirectoryError(path.value);
      case 'unreadable':
        throw new WorkspaceDirectoryUnreadableError(path.value);
      case 'read':
        return listDirectory({
          directory: path,
          workspace,
          criteria,
          children: read.children,
          exhausted: read.exhausted,
          limit: this.limit,
        });
    }
  }
}
