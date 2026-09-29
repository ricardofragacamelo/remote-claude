/** A root this installation will let Claude run in, as the screen knows it. */
export interface Workspace {
  /** Absolute path, with every symlink already resolved by the backend. */
  readonly path: string;
  readonly label: string;
  /** ISO-8601, or `null` when this user has never opened anything under it. */
  readonly lastUsedAt: string | null;
}

/**
 * One subdirectory of a listing (`GET /workspaces/directories`).
 *
 * The shapes below mirror the contract of docs/architecture/backend/03-modules.md#workspace; the
 * service that reads them arrives with the "Open folder" dialog (plan 06, F2).
 */
export interface DirectoryEntry {
  readonly name: string;
  /** Absolute path of the entry as listed — for a symlink, the link, not its target. */
  readonly path: string;
  readonly hidden: boolean;
  readonly symlink: boolean;
}

/** One level of one directory, never the tree. */
export interface DirectoryListing {
  readonly path: string;
  readonly root: Workspace;
  /** `null` at the root: the picker never climbs above it. */
  readonly parent: string | null;
  readonly entries: readonly DirectoryEntry[];
  /** The ceiling cut the listing; asking with a prefix reaches what was left out. */
  readonly truncated: boolean;
}

/** One folder this user opened, as the welcome screen lists it (`GET /workspaces/recent`). */
export interface RecentFolder {
  readonly path: string;
  readonly rootLabel: string;
  /** ISO-8601. */
  readonly lastOpenedAt: string;
  readonly pinned: boolean;
  /** `false` for a folder that left the allowlist or the disk — marked, rather than dropped. */
  readonly available: boolean;
}

/** Whether an open tab can still be used, as the server revalidated it. */
export type OpenFolderState = 'available' | 'notAllowed' | 'missing';

/** One folder tab, in the order the user left them (`GET /workspaces/open-folders`). */
export interface OpenFolder {
  readonly path: string;
  /** The label of the root it lives under, or `null` once it lives under none. */
  readonly rootLabel: string | null;
  readonly state: OpenFolderState;
}
