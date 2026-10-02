import { isAbsolute } from 'node:path';

import { z } from 'zod';

import type { FolderState, FolderView, RecentFolderView } from '@application/workspace';
import type { DirectoryListing, Workspace } from '@domain/workspace';

/** One allowed root, as the client sees it. */
export interface WorkspaceDto {
  /** Absolute path of the root, with every symlink already resolved. */
  readonly path: string;
  readonly label: string;
  /** ISO-8601, or `null` when this user has never opened anything under it. */
  readonly lastUsedAt: string | null;
}

/** The listing. An object and not a bare array, so the response can grow a field later. */
export interface WorkspaceListDto {
  readonly workspaces: readonly WorkspaceDto[];
}

/**
 * What `GET /workspaces/resolve` is asked.
 *
 * The path travels as a query parameter rather than in the URL path: an absolute path in a URL
 * segment has to be encoded, and a proxy that normalises `%2F` on the way through would silently
 * change the value the allowlist is about to check.
 */
export const resolveWorkspaceSchema = z.object({ path: z.string().min(1) });

export type ResolveWorkspaceDto = z.infer<typeof resolveWorkspaceSchema>;

/** A path that cleared every check, and the root it cleared under. */
export interface ResolvedWorkspaceDto {
  readonly path: string;
  readonly root: WorkspaceDto;
}

/**
 * A path as the workbench routes take it: absolute, without NUL, and without a `..` segment.
 *
 * Format only, as everywhere at this edge — whether the path may be reached is the allowlist's
 * question, answered in the use case against the realpath. `..` is refused here and not collapsed:
 * the workbench walks up by the `parent` a listing hands out, never by editing a path, so a `..`
 * that arrives was typed by somebody probing the fence (plan 06, S-02).
 */
export const folderPath = z
  .string()
  .min(1)
  .max(4096)
  .refine((path) => isAbsolute(path), { message: 'mustBeAbsolute' })
  .refine((path) => !path.includes('\0'), { message: 'mustNotContainNul' })
  .refine((path) => !path.split('/').includes('..'), { message: 'mustNotClimb' });

/** A query string's boolean: the literal words, and `false` when it is absent. */
export const flag = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true');

/**
 * What `GET /workspaces/directories` is asked.
 *
 * `prefix` narrows the listing to names that start with it, which is how an entry past the ceiling
 * is reached ([06 · D-05](../../../../../../docs/plans/06-workbench/decisions.md)); it is one name,
 * never a path.
 */
export const listDirectoriesSchema = z.object({
  path: folderPath,
  hidden: flag,
  prefix: z
    .string()
    .min(1)
    .max(255)
    .refine((prefix) => !prefix.includes('/') && !prefix.includes('\0'), {
      message: 'mustBeOneName',
    })
    .optional(),
});

export type ListDirectoriesQueryDto = z.infer<typeof listDirectoriesSchema>;

/** One subdirectory of a listing. */
export interface DirectoryEntryDto {
  readonly name: string;
  /** Absolute path of the entry as listed — for a symlink, the link, not its target. */
  readonly path: string;
  /** The name starts with `.`. Listed only when `hidden=true` was asked. */
  readonly hidden: boolean;
  /** A symlink whose target is a directory inside the same root. One that escapes is omitted. */
  readonly symlink: boolean;
}

/** One level of one directory, never the tree. */
export interface DirectoryListingDto {
  readonly path: string;
  readonly root: WorkspaceDto;
  /** `null` at the root: the picker never climbs above it. */
  readonly parent: string | null;
  readonly entries: readonly DirectoryEntryDto[];
  /** The ceiling cut the listing; `prefix` reaches what was left out. */
  readonly truncated: boolean;
}

/**
 * One folder, named by itself: the body of `POST /workspaces/open-folders`, and the query string of
 * closing a tab or forgetting a recent one.
 */
export const folderSchema = z.object({ path: folderPath });

export type FolderDto = z.infer<typeof folderSchema>;

/** What `PUT /workspaces/recent/pin` is sent. */
export const pinRecentFolderSchema = z.object({ path: folderPath, pinned: z.boolean() });

export type PinRecentFolderDto = z.infer<typeof pinRecentFolderSchema>;

/**
 * What `PUT /workspaces/open-folders/order` is sent: every open folder, in the new order.
 *
 * Whether the set is the one open is the use case's question (`409` `CONFLICT` when it is not);
 * here only its shape is.
 */
export const reorderOpenFoldersSchema = z.object({ paths: z.array(folderPath).min(1) });

export type ReorderOpenFoldersDto = z.infer<typeof reorderOpenFoldersSchema>;

/** One folder this user opened, as the welcome screen lists it. */
export interface RecentFolderDto {
  readonly path: string;
  /** The label of the root it lives under now, or `null` once it lives under none. */
  readonly rootLabel: string | null;
  /** ISO-8601. */
  readonly lastOpenedAt: string;
  readonly pinned: boolean;
  /** `false` for a folder that left the allowlist or the disk — marked, rather than dropped. */
  readonly available: boolean;
}

export interface RecentFoldersDto {
  readonly folders: readonly RecentFolderDto[];
}

/** Whether an open tab can still be used, revalidated on every read. */
export type OpenFolderState = FolderState;

/** One folder tab, in the order the user left them. */
export interface OpenFolderEntryDto {
  readonly path: string;
  /** The label of the root it lives under, or `null` once it lives under none. */
  readonly rootLabel: string | null;
  readonly state: OpenFolderState;
}

export interface OpenFoldersDto {
  readonly folders: readonly OpenFolderEntryDto[];
}

/**
 * The transport shape of a root.
 *
 * `authorisedUsers` deliberately never crosses: who else may reach a root is nobody's business but
 * the operator's, and the caller already knows they themselves may.
 */
export function toWorkspaceDto(workspace: Workspace): WorkspaceDto {
  return {
    path: workspace.root.value,
    label: workspace.label,
    lastUsedAt: workspace.lastUsedAt?.toISOString() ?? null,
  };
}

/** A listing, as the picker reads it. */
export function toDirectoryListingDto(listing: DirectoryListing): DirectoryListingDto {
  return {
    path: listing.path.value,
    root: toWorkspaceDto(listing.workspace),
    parent: listing.parent?.value ?? null,
    entries: listing.entries.map((entry) => ({
      name: entry.name,
      path: entry.path,
      hidden: entry.hidden,
      symlink: entry.symlink,
    })),
    truncated: listing.truncated,
  };
}

/** A recent folder, as the welcome screen lists it. */
export function toRecentFolderDto(view: RecentFolderView): RecentFolderDto {
  return {
    path: view.folder.path.value,
    rootLabel: view.rootLabel,
    lastOpenedAt: view.lastOpenedAt.toISOString(),
    pinned: view.folder.pinned,
    available: view.state === 'available',
  };
}

/** A folder tab. */
export function toOpenFolderEntryDto(view: FolderView): OpenFolderEntryDto {
  return { path: view.folder.path.value, rootLabel: view.rootLabel, state: view.state };
}
