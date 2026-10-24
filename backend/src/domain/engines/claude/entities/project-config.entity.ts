/**
 * What the project's own `.claude/` injects into Claude's sessions (plan 13, F3; D-16): memory,
 * slash commands, subagents, output styles, hooks, permissions and plugins — read from the
 * documented-format files the repository versions, never the unpublished surface (B-08's rule).
 *
 * Every type here is a view: pure data, no I/O, no SDK vocabulary. The adapter in
 * `adapter/outbound/engines/claude/` is the only place that reads a file or a frontmatter block —
 * `node:path` here is string arithmetic only, the same exception `WorkspacePath` already makes.
 */

import path from 'node:path';

/** Where a memory file sits in the chain Claude Code climbs for `CLAUDE.md` (plan 13, B-32). */
export type MemoryFileOrigin = 'root' | 'claudeDir' | 'local' | 'ancestor' | 'user';

/**
 * One memory file this product's sessions might read, whether it exists or not — the empty state
 * is itself informative (S-149).
 */
export interface MemoryFileView {
  /** Absolute on disk — never read for its content here, only `stat`-ed (D-16). */
  readonly path: string;
  readonly origin: MemoryFileOrigin;
  readonly exists: boolean;
  readonly sizeBytes: number | null;
  readonly modifiedAt: string | null;

  /** What the spike measured of this origin, regardless of any particular session (S-148). */
  readonly loadedByRule: boolean;

  /** What a live session's own `getContextUsage` says, or `null` with no live session to ask. */
  readonly loadedConfirmed: boolean | null;

  /** `loadedConfirmed` disagreeing with `loadedByRule` — shown as a warning, never hidden (S-148). */
  readonly diverges: boolean;
}

/** The rule the spike measured (docs/discovery/01, #11 round, item 5): project memory loads, the
 * user's and the local override do not. Ancestors climb the same way the project root does — Claude
 * Code's own documented memory discovery, not something this spike needed to measure. */
export function memoryLoadedByRule(origin: MemoryFileOrigin): boolean {
  return origin === 'root' || origin === 'claudeDir' || origin === 'ancestor';
}

/** Whether a confirmed answer disagrees with the rule — `null` when there is nothing to confirm. */
export function memoryDiverges(loadedByRule: boolean, loadedConfirmed: boolean | null): boolean {
  return loadedConfirmed !== null && loadedConfirmed !== loadedByRule;
}

/** One memory file site worth asking about — a path, and where it sits in the climb. */
export interface MemoryFileCandidate {
  readonly path: string;
  readonly origin: MemoryFileOrigin;
}

/** `current` is, or is under, `root` — a path comparison, no `stat` (mirrors `WorkspacePath`). */
function isWithinRoot(candidate: string, root: string): boolean {
  const normalizedRoot = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return candidate === root || candidate.startsWith(normalizedRoot);
}

/**
 * Every memory file site this product's sessions might read for a folder (plan 13, B-32): the
 * folder's own `CLAUDE.md` and `.claude/CLAUDE.md`, its `CLAUDE.local.md`, each ancestor's
 * `CLAUDE.md` up to (not past) `allowlistRoot`, and the user's own, under `homeConfigDir`. Pure path
 * arithmetic — the adapter `stat`s each one; this function never touches the filesystem.
 */
export function memoryFileCandidatesOf(
  folderPath: string,
  allowlistRoot: string,
  homeConfigDir: string,
): readonly MemoryFileCandidate[] {
  const candidates: MemoryFileCandidate[] = [
    { path: path.join(folderPath, 'CLAUDE.md'), origin: 'root' },
    { path: path.join(folderPath, '.claude', 'CLAUDE.md'), origin: 'claudeDir' },
    { path: path.join(folderPath, 'CLAUDE.local.md'), origin: 'local' },
  ];

  let current = path.dirname(folderPath);
  while (current !== folderPath && isWithinRoot(current, allowlistRoot)) {
    candidates.push({ path: path.join(current, 'CLAUDE.md'), origin: 'ancestor' });
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  candidates.push({ path: path.join(homeConfigDir, 'CLAUDE.md'), origin: 'user' });
  return candidates;
}

/** A slash command of the project, as the "Project" card of the screen lists it (plan 13, B-33). */
export interface ProjectCommandView {
  readonly name: string;
  readonly description: string;
  readonly argumentHint: string;

  /** Relative to the folder, e.g. `.claude/commands/review.md` — `null` when no file on disk matched. */
  readonly sourceFile: string | null;

  /** `/name` runs the engine's own command instead (plan 08's `menuOf`, reused). */
  readonly shadowed: boolean;
}

/** What a subagent's frontmatter can widen beyond the session it runs in (plan 13, B-36, D-23). */
export type AgentRisk = 'permissionMode' | 'broadTools' | 'mcpServers';

/** A subagent of the project. */
export interface ProjectAgentView {
  readonly name: string;
  readonly description: string;
  readonly model: string | null;
  readonly sourceFile: string | null;
  readonly risks: readonly AgentRisk[];
}

/** The frontmatter fields of a `.claude/agents/*.md` file that can widen what it may do. */
export interface AgentFrontmatter {
  readonly permissionMode?: unknown;
  readonly tools?: unknown;
  readonly mcpServers?: unknown;
}

/**
 * The tools a frontmatter can name without narrowing anything — a bare `tools:` with no list, or a
 * list of more than a small, deliberate handful, reads as "broad" (S-175): the point is not an exact
 * threshold, it is catching a frontmatter that did not bother to narrow at all.
 */
const BROAD_TOOLS_THRESHOLD = 6;

/** Which risks a subagent's frontmatter declares, read off already-parsed fields (pure; S-175). */
export function agentRisksOf(frontmatter: AgentFrontmatter): readonly AgentRisk[] {
  const risks: AgentRisk[] = [];

  if (typeof frontmatter.permissionMode === 'string' && frontmatter.permissionMode.trim() !== '') {
    risks.push('permissionMode');
  }

  if (frontmatter.mcpServers !== undefined && frontmatter.mcpServers !== null) {
    risks.push('mcpServers');
  }

  const { tools } = frontmatter;
  const isBroad =
    tools === '*' ||
    tools === 'all' ||
    (Array.isArray(tools) && tools.length > BROAD_TOOLS_THRESHOLD);
  if (isBroad) {
    risks.push('broadTools');
  }

  return risks;
}

/** An output style of the project, or of the installation, as the "Project" card lists it (B-37). */
export interface ProjectOutputStyleView {
  readonly name: string;
  readonly current: boolean;
  readonly sourceFile: string | null;
}

/** A hook declared in `.claude/settings.json`, by extenso — never edited here (plan 13, B-38, D-17). */
export interface ProjectHookView {
  readonly event: string;
  readonly matcher: string | null;
  readonly command: string;
}

/** A permission rule of the project's `settings.json` — `allow` never applies here (D-17). */
export interface ProjectPermissionRuleView {
  readonly rule: string;
  readonly kind: 'allow' | 'deny';

  /** `true` only for `deny`: the backend clears the trust mark, so an `allow` here has no effect. */
  readonly appliesHere: boolean;
}

/** `deny`/`allow` of `.claude/settings.json`, each described by whether it applies here (B-38). */
export function permissionRuleViewsOf(
  allow: readonly string[],
  deny: readonly string[],
): readonly ProjectPermissionRuleView[] {
  return [
    ...deny.map((rule): ProjectPermissionRuleView => ({ rule, kind: 'deny', appliesHere: true })),
    ...allow.map((rule): ProjectPermissionRuleView => ({
      rule,
      kind: 'allow',
      appliesHere: false,
    })),
  ];
}

/** The plugins `.claude/settings.json` declares — only a listing, with an aviso, never a toggle (B-38). */
export interface ProjectPluginsDeclaration {
  readonly enabled: readonly string[];
  readonly disabled: readonly string[];
  readonly enableAllProjectMcpServers: boolean;
}

/** Why one documented-format file of `.claude/` could not be read in full (S-143, S-144). */
export type ProjectConfigIssueReason = 'malformed' | 'tooLarge' | 'linkEscapesRoot';

/** One file the reader could not make sense of — the rest of the screen still works (S-143). */
export interface ProjectConfigIssue {
  /** Relative to the folder, e.g. `.claude/settings.json`. */
  readonly path: string;
  readonly reason: ProjectConfigIssueReason;
}

/** `GET /engines/claude/project-config` — everything the repository injects into Claude (B-31). */
export interface ProjectConfigView {
  readonly folderPath: string;
  readonly memory: readonly MemoryFileView[];
  readonly commands: readonly ProjectCommandView[];
  readonly agents: readonly ProjectAgentView[];
  readonly outputStyles: readonly ProjectOutputStyleView[];
  readonly hooks: readonly ProjectHookView[];
  readonly permissions: readonly ProjectPermissionRuleView[];
  readonly plugins: ProjectPluginsDeclaration;
  readonly issues: readonly ProjectConfigIssue[];
}
