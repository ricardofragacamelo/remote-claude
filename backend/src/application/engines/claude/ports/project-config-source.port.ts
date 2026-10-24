import type {
  ProjectConfigIssue,
  ProjectHookView,
  ProjectPluginsDeclaration,
} from '@domain/engines/claude';

/** One memory file site the reader found or did not — `stat`, never content (D-16). */
export interface MemoryFileStat {
  readonly exists: boolean;
  readonly sizeBytes: number | null;
  readonly modifiedAt: string | null;
}

/** One `.claude/commands/` or `.claude/agents/` file the reader found, by the name it declares. */
export interface ProjectCommandFile {
  readonly name: string;
  readonly relativePath: string;
}

/** A `.claude/agents/*.md` file, with the frontmatter fields that can widen what it runs as. */
export interface ProjectAgentFile {
  readonly name: string;
  readonly relativePath: string;
  readonly permissionMode: unknown;
  readonly tools: unknown;
  readonly mcpServers: unknown;
}

/** A `.claude/output-styles/*.md` file, by the name the installation would know it by. */
export interface ProjectOutputStyleFile {
  readonly name: string;
  readonly relativePath: string;
}

/** `.claude/settings.json`'s `permissions`, read tolerantly — an absent list is simply empty. */
export interface ProjectPermissionsDeclaration {
  readonly allow: readonly string[];
  readonly deny: readonly string[];
}

/** Where a project-config read happens, and under what root it must stay contained. */
export interface ProjectConfigReadRequest {
  readonly folderPath: string;
  readonly allowlistRoot: string;

  /** Every absolute path a memory file might be at — the use case computed the list (B-32). */
  readonly memoryFilePaths: readonly string[];

  /** The user's own `CLAUDE_CONFIG_DIR` effective directory — the other root a memory file may sit under. */
  readonly homeConfigDir: string;
}

/** Everything a sweep of one folder's `.claude/` found, raw — the use case gives it meaning. */
export interface ProjectConfigFileRead {
  readonly memoryFiles: Readonly<Record<string, MemoryFileStat>>;
  readonly commandFiles: readonly ProjectCommandFile[];
  readonly agentFiles: readonly ProjectAgentFile[];
  readonly outputStyleFiles: readonly ProjectOutputStyleFile[];
  readonly hooks: readonly ProjectHookView[];
  readonly permissions: ProjectPermissionsDeclaration;
  readonly plugins: ProjectPluginsDeclaration;
  readonly issues: readonly ProjectConfigIssue[];
}

/**
 * Reads the documented-format files of a project's `.claude/` (plan 13, B-31, D-16) — never the
 * unpublished control requests B-08 forbids. Cached per folder, invalidated by the mtime of
 * `.claude/` and of `.mcp.json` (S-147); a symlink that would carry a file outside of
 * `allowlistRoot` is refused for that one file, the rest of the sweep unaffected (S-144).
 */
export interface ProjectConfigSource {
  read(request: ProjectConfigReadRequest): Promise<ProjectConfigFileRead>;
}

export const PROJECT_CONFIG_SOURCE = Symbol('ProjectConfigSource');
