/** A root this installation will let Claude run in, as the screen knows it. */
export interface Workspace {
  /** Absolute path, with every symlink already resolved by the backend. */
  readonly path: string;
  readonly label: string;
  /** ISO-8601, or `null` when this user has never opened anything under it. */
  readonly lastUsedAt: string | null;
}

/** A path that cleared every check (`GET /workspaces/resolve`), and the root it cleared under. */
export interface ResolvedFolder {
  /** The **real** path — every symlink resolved. It is what a session is started on. */
  readonly path: string;
  /** The last segment of the path — what a person calls the folder. */
  readonly name: string;
  readonly root: Workspace;
}

/** What one listing is asked: a folder, whether dot-folders come too, and a name prefix. */
export interface DirectoryQuery {
  readonly path: string;
  readonly hidden: boolean;
  /** One name, never a path. Reaches what the ceiling cut (plan 06, D-05). */
  readonly prefix?: string | undefined;
}

/**
 * One subdirectory of a listing (`GET /workspaces/directories`).
 *
 * The shapes below mirror the contract of docs/architecture/backend/03-modules.md#workspace.
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

/**
 * Why a recent folder can no longer be opened.
 *
 * `notAllowed` when it lives under no root of this user any more; `missing` when the root is still
 * there and the folder is not.
 */
export type UnavailableReason = 'notAllowed' | 'missing';

/** One folder this user opened, as the welcome screen lists it (`GET /workspaces/recent`). */
export interface RecentFolder {
  readonly path: string;
  /** The last segment of the path — what a person calls the folder. */
  readonly name: string;
  /** The label of the root it lives under, or `null` once it lives under none. */
  readonly rootLabel: string | null;
  /** ISO-8601. */
  readonly lastOpenedAt: string;
  readonly pinned: boolean;
  /** `null` while it can be opened — marked with the reason otherwise, rather than dropped. */
  readonly unavailable: UnavailableReason | null;
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
