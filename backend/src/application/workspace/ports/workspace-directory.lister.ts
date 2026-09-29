import type { DirectoryChild, DirectoryListingCriteria } from '@domain/workspace';

/** What reading one directory came to. */
export type DirectoryRead =
  | {
      readonly kind: 'read';
      /** Directories and symlinks the criteria admits, in the order the disk handed them over. */
      readonly children: readonly DirectoryChild[];
      /** Read to the end, rather than stopped at the ceiling. */
      readonly exhausted: boolean;
    }
  /** Gone between the inspection and the read. */
  | { readonly kind: 'missing' }
  /** Replaced by something that is not a directory between the inspection and the read. */
  | { readonly kind: 'notADirectory' }
  /** There, and this process may not read it (`EACCES`, `EPERM`). */
  | { readonly kind: 'unreadable' };

/**
 * The one place the `workspace` module reads the contents of a directory.
 *
 * One level, on demand, and never more than `limit` children: the port **stops reading** once it
 * has that many, so the cost of a listing does not grow with the size of the directory —
 * `node_modules/.pnpm` has thousands of entries ([06 · D-05](../../../../../docs/plans/06-workbench/decisions.md)).
 * It applies the criteria as it reads, so the ceiling counts only what can be listed.
 *
 * It reports where a symlink leads and never decides whether that is inside the fence: that is the
 * domain's rule (`listDirectory`), and a port that decided it would be a second fence.
 */
export interface WorkspaceDirectoryLister {
  /**
   * @param path the real path of a directory already cleared by the allowlist
   * @param criteria which names to keep
   * @param limit how many children to read before stopping
   */
  read(path: string, criteria: DirectoryListingCriteria, limit: number): Promise<DirectoryRead>;
}

export const WORKSPACE_DIRECTORY_LISTER = Symbol('WorkspaceDirectoryLister');
