import type { ProjectMcpEntry } from '@domain/mcp';

/** Why a project's MCP file at one folder could not be read — never thrown, always shown. */
export type ProjectMcpFileError = 'malformed' | 'tooLarge' | 'linkEscapesRoot';

/** One project MCP file site the climb found — read, or explained why not (S-106). */
export interface ProjectMcpFileRead {
  readonly folderPath: string;
  readonly entries: readonly ProjectMcpEntry[];
  readonly error: ProjectMcpFileError | null;
}

/** Where a climb starts, and how far it may go. */
export interface ProjectMcpClimbRequest {
  readonly folder: string;
  readonly allowlistRoot: string;
}

/**
 * Where a project's own MCP servers come from — engine-specific, since which file holds them and
 * how far a reader climbs to find one are the engine's own discovery rules, not a neutral concept
 * the core assumes (plan 13, B-24; D-11).
 *
 * Declared here, in `application/mcp`, and implemented by the adapter of whichever engine carries
 * the `mcp` capability — never a field of that engine's own library crossing this boundary; what
 * crosses is always {@link import('@domain/mcp').ProjectMcpEntry}.
 */
export interface ProjectMcpServersSource {
  /**
   * Every file site from `request.folder` up to the first directory with a VCS root marker, or to
   * `request.allowlistRoot`, whichever comes first — nearest folder first. A level with no file at
   * all is simply absent from the result; one with a file that could not be read is present with
   * `entries: []` and `error` set.
   */
  climb(request: ProjectMcpClimbRequest): Promise<readonly ProjectMcpFileRead[]>;

  /** The file of exactly this folder, read on its own — `null` when there is none there at all. */
  readAt(folderPath: string): Promise<ProjectMcpFileRead | null>;
}
