import { z } from 'zod';

import type { Workspace } from '@domain/workspace';

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
