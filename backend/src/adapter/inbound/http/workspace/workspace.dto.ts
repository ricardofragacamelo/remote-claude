import { isAbsolute } from 'node:path';

import { z } from 'zod';

import type {
  DirectoryListingPayload,
  OpenFolderEntryPayload,
  RecentFoldersPayload,
  Workspace as WorkspacePayload,
} from '@remote-claude/contracts';

import type { FolderState, FolderView, RecentFolderView } from '@application/workspace';
import type { DirectoryListing, Workspace } from '@domain/workspace';

/**
 * What `GET /workspaces/resolve` is asked.
 *
 * The path travels as a query parameter rather than in the URL path: an absolute path in a URL
 * segment has to be encoded, and a proxy that normalises `%2F` on the way through would silently
 * change the value the allowlist is about to check.
 */
export const resolveWorkspaceSchema = z.object({ path: z.string().min(1) });

export type ResolveWorkspaceDto = z.infer<typeof resolveWorkspaceSchema>;

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

/** Whether an open tab can still be used, revalidated on every read. */
export type OpenFolderState = FolderState;

/**
 * The transport shape of a root.
 *
 * `authorisedUsers` deliberately never crosses: who else may reach a root is nobody's business but
 * the operator's, and the caller already knows they themselves may.
 */
export function toWorkspaceDto(workspace: Workspace): WorkspacePayload {
  return {
    path: workspace.root.value,
    label: workspace.label,
    lastUsedAt: workspace.lastUsedAt?.toISOString() ?? null,
  };
}

/** A listing, as the picker reads it. */
export function toDirectoryListingDto(listing: DirectoryListing): DirectoryListingPayload {
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
export function toRecentFolderDto(view: RecentFolderView): RecentFoldersPayload['folders'][number] {
  return {
    path: view.folder.path.value,
    rootLabel: view.rootLabel,
    lastOpenedAt: view.lastOpenedAt.toISOString(),
    pinned: view.folder.pinned,
    available: view.state === 'available',
  };
}

/** A folder tab. */
export function toOpenFolderEntryDto(view: FolderView): OpenFolderEntryPayload {
  return { path: view.folder.path.value, rootLabel: view.rootLabel, state: view.state };
}
