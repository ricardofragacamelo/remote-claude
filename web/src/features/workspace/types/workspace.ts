import type {
  DirectoryListingPayload,
  DirectoryListingPayloadEntriesItem,
  OpenFolderEntry,
  RecentFoldersPayloadFoldersItem,
  ResolvedWorkspacePayload,
  Workspace as ContractWorkspace,
} from '@remote-claude/contracts';

/** A root this installation will let the agent run in, as the screen knows it (`GET /workspaces`). */
export type Workspace = ContractWorkspace;

/**
 * A path that cleared every check (`GET /workspaces/resolve`), and the root it cleared under —
 * with `name`, the last segment of the path, added for what a person calls the folder: derived
 * here, never sent by the server.
 */
export type ResolvedFolder = ResolvedWorkspacePayload & {
  readonly name: string;
};

/** What one listing is asked: a folder, whether dot-folders come too, and a name prefix. */
export interface DirectoryQuery {
  readonly path: string;
  readonly hidden: boolean;
  /** One name, never a path. Reaches what the ceiling cut (plan 06, D-05). */
  readonly prefix?: string | undefined;
}

/** One subdirectory of a listing (`GET /workspaces/directories`). */
export type DirectoryEntry = DirectoryListingPayloadEntriesItem;

/** One level of one directory, never the tree. */
export type DirectoryListing = DirectoryListingPayload;

/**
 * Why a recent folder can no longer be opened.
 *
 * `notAllowed` when it lives under no root of this user any more; `missing` when the root is still
 * there and the folder is not.
 */
export type UnavailableReason = 'notAllowed' | 'missing';

/**
 * One folder this user opened, as the welcome screen lists it (`GET /workspaces/recent`).
 *
 * `name` is derived, never sent by the server. `unavailable` replaces the wire's `available`
 * boolean with the reason it is not, the screen's own derived read of it.
 */
export type RecentFolder = Pick<
  RecentFoldersPayloadFoldersItem,
  'path' | 'rootLabel' | 'lastOpenedAt' | 'pinned'
> & {
  readonly name: string;
  readonly unavailable: UnavailableReason | null;
};

/** Whether an open tab can still be used, as the server revalidated it. */
export type OpenFolderState = OpenFolderEntry['state'];

/** One folder tab, in the order the user left them (`GET /workspaces/open-folders`). */
export type OpenFolder = OpenFolderEntry;
