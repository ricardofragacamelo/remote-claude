import { promises as fs } from 'node:fs';
import path from 'node:path';

import { Injectable } from '@nestjs/common';

import type {
  MemoryFileStat,
  ProjectAgentFile,
  ProjectCommandFile,
  ProjectConfigFileRead,
  ProjectConfigReadRequest,
  ProjectConfigSource,
  ProjectOutputStyleFile,
  ProjectPermissionsDeclaration,
} from '@application/engines/claude';
import type {
  ProjectConfigIssue,
  ProjectHookView,
  ProjectPluginsDeclaration,
} from '@domain/engines/claude';
import { isPlainObject } from '@shared/utils/plain-object';
import { parseFrontmatter } from './markdown-frontmatter';
import { isWithinRoot } from './within-root';

const SETTINGS_PATH = ['.claude', 'settings.json'];
const COMMANDS_DIR = ['.claude', 'commands'];
const AGENTS_DIR = ['.claude', 'agents'];
const OUTPUT_STYLES_DIR = ['.claude', 'output-styles'];
const MCP_JSON_NAME = '.mcp.json';

/** A `.claude/settings.json`, or a command/agent/output-style file, larger than this is not read. */
const MAX_FILE_BYTES = 65_536;

const EMPTY_STAT: MemoryFileStat = { exists: false, sizeBytes: null, modifiedAt: null };

/** `stat`s one memory file site — never its content (D-16). An escaping symlink reads as absent. */
async function memoryStatOf(
  filePath: string,
  allowlistRoot: string,
  homeConfigDir: string,
): Promise<MemoryFileStat> {
  const lstat = await fs.lstat(filePath).catch(() => null);
  if (lstat === null) {
    return EMPTY_STAT;
  }

  const real = await fs.realpath(filePath).catch(() => null);
  if (real === null) {
    return EMPTY_STAT;
  }
  if (!isWithinRoot(real, allowlistRoot) && !isWithinRoot(real, homeConfigDir)) {
    return EMPTY_STAT;
  }

  const stat = await fs.stat(real).catch(() => null);
  if (stat === null || !stat.isFile()) {
    return EMPTY_STAT;
  }

  return { exists: true, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() };
}

/** One small text file within `root`, refusing a symlink that escapes it or one too large to read. */
async function readTextWithin(
  root: string,
  relativeSegments: readonly string[],
): Promise<{ readonly content: string } | { readonly issue: ProjectConfigIssue['reason'] } | null> {
  const filePath = path.join(root, ...relativeSegments);
  const lstat = await fs.lstat(filePath).catch(() => null);
  if (lstat === null) {
    return null;
  }
  if (lstat.size > MAX_FILE_BYTES) {
    return { issue: 'tooLarge' };
  }

  const real = await fs.realpath(filePath).catch(() => null);
  if (real === null) {
    return { issue: 'malformed' };
  }
  if (!isWithinRoot(real, root)) {
    return { issue: 'linkEscapesRoot' };
  }

  try {
    return { content: await fs.readFile(real, 'utf8') };
  } catch {
    return { issue: 'malformed' };
  }
}

/** The `.md` files directly inside `root/segments` (not recursive), by name without extension. */
async function markdownFilesIn(
  root: string,
  segments: readonly string[],
): Promise<
  readonly { readonly name: string; readonly relativePath: string; readonly absolutePath: string }[]
> {
  const dir = path.join(root, ...segments);
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => ({
      name: entry.name.slice(0, -'.md'.length),
      relativePath: [...segments, entry.name].join('/'),
      absolutePath: path.join(dir, entry.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every `.md` file under `.claude/commands/`, recursively — a subdirectory becomes a namespace
 * segment joined with `:`, the same convention the CLI itself uses for a plugin's own commands
 * (`git/commit.md` → `git:commit`).
 */
async function commandFilesIn(root: string): Promise<readonly ProjectCommandFile[]> {
  const commandsRoot = path.join(root, ...COMMANDS_DIR);
  const found: ProjectCommandFile[] = [];

  async function walk(
    dir: string,
    namePrefix: readonly string[],
    pathPrefix: readonly string[],
  ): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        await walk(
          path.join(dir, entry.name),
          [...namePrefix, entry.name],
          [...pathPrefix, entry.name],
        );
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const stem = entry.name.slice(0, -'.md'.length);
        found.push({
          name: [...namePrefix, stem].join(':'),
          relativePath: [...COMMANDS_DIR, ...pathPrefix, entry.name].join('/'),
        });
      }
    }
  }

  await walk(commandsRoot, [], []);
  return found;
}

/** Every `.claude/agents/*.md` file, with the frontmatter fields that can widen what it runs as. */
async function agentFilesIn(root: string): Promise<readonly ProjectAgentFile[]> {
  const files = await markdownFilesIn(root, AGENTS_DIR);
  const result: ProjectAgentFile[] = [];

  for (const file of files) {
    const raw = await fs.readFile(file.absolutePath, 'utf8').catch(() => null);
    const frontmatter = raw === null ? {} : parseFrontmatter(raw);
    result.push({
      name: file.name,
      relativePath: file.relativePath,
      permissionMode: frontmatter['permissionMode'],
      tools: frontmatter['tools'],
      mcpServers: frontmatter['mcpServers'],
    });
  }

  return result;
}

/** Every `.claude/output-styles/*.md` file, by the name the installation would offer it under. */
async function outputStyleFilesIn(root: string): Promise<readonly ProjectOutputStyleFile[]> {
  const files = await markdownFilesIn(root, OUTPUT_STYLES_DIR);
  return files.map((file) => ({ name: file.name, relativePath: file.relativePath }));
}

/** One string of `value`, or `null` if it is not one — defensive reading of an untrusted document. */
function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** The strings of an array, dropping anything that is not one — never throws on a malformed entry. */
function stringsOf(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/** `.claude/settings.json`'s `hooks`, flattened to one row per command (plan 13, B-38). */
function hooksOf(parsed: Record<string, unknown>): readonly ProjectHookView[] {
  const events = parsed['hooks'];
  if (!isPlainObject(events)) {
    return [];
  }

  const rows: ProjectHookView[] = [];
  for (const [event, matchers] of Object.entries(events)) {
    if (!Array.isArray(matchers)) {
      continue;
    }
    for (const matcherEntry of matchers) {
      if (!isPlainObject(matcherEntry)) {
        continue;
      }
      const matcher = stringOrNull(matcherEntry['matcher']);
      const hooks = matcherEntry['hooks'];
      if (!Array.isArray(hooks)) {
        continue;
      }
      for (const hook of hooks) {
        if (!isPlainObject(hook)) {
          continue;
        }
        const command = stringOrNull(hook['command']);
        if (command !== null) {
          rows.push({ event, matcher, command });
        }
      }
    }
  }
  return rows;
}

/** `.claude/settings.json`'s `permissions` — an absent list reads as empty, never a failure. */
function permissionsOf(parsed: Record<string, unknown>): ProjectPermissionsDeclaration {
  const permissions = parsed['permissions'];
  if (!isPlainObject(permissions)) {
    return { allow: [], deny: [] };
  }
  return { allow: stringsOf(permissions['allow']), deny: stringsOf(permissions['deny']) };
}

/** `.claude/settings.json`'s `enabledPlugins` and `enableAllProjectMcpServers` (B-38). */
function pluginsOf(parsed: Record<string, unknown>): ProjectPluginsDeclaration {
  const declared = parsed['enabledPlugins'];
  const enabled: string[] = [];
  const disabled: string[] = [];

  if (isPlainObject(declared)) {
    for (const [name, value] of Object.entries(declared)) {
      (value === true ? enabled : disabled).push(name);
    }
  }

  return {
    enabled,
    disabled,
    enableAllProjectMcpServers: parsed['enableAllProjectMcpServers'] === true,
  };
}

interface Cached {
  readonly signature: string;
  readonly read: ProjectConfigFileRead;
}

/**
 * The mtime of a directory changes when a direct child is added, removed or renamed — never when a
 * grandchild is (a new `.claude/commands/review.md` does not touch `.claude/`'s own mtime, only
 * `.claude/commands/`'s). So the signature is every site a write under `.claude/` could land on,
 * each `stat`-ed on its own: the directory itself, the three subdirectories this reader lists, the
 * settings file (whose own mtime also changes when its *content* is rewritten in place, unlike a
 * directory's), and the project's `.mcp.json` (B-31's own two sites, named by extenso).
 */
async function signatureOf(folderPath: string): Promise<string> {
  const sites = [
    path.join(folderPath, '.claude'),
    path.join(folderPath, ...SETTINGS_PATH),
    path.join(folderPath, ...COMMANDS_DIR),
    path.join(folderPath, ...AGENTS_DIR),
    path.join(folderPath, ...OUTPUT_STYLES_DIR),
    path.join(folderPath, MCP_JSON_NAME),
  ];

  const mtimes = await Promise.all(
    sites.map((site) =>
      fs
        .stat(site)
        .then((stat) => stat.mtimeMs)
        .catch(() => null),
    ),
  );
  return JSON.stringify(mtimes);
}

/**
 * Reads the documented-format files of a project's `.claude/` (plan 13, B-31…B-33, B-36…B-38; D-16):
 * `settings.json`'s hooks, permissions and declared plugins; the commands, agents and output styles
 * on disk; and the `stat` of every memory file site the use case asked about. Every file read is
 * best-effort — a missing directory is simply empty, a malformed or oversized file becomes one entry
 * in `issues`, and the rest of the sweep is unaffected (S-143).
 *
 * Cached per folder (S-147), invalidated by {@link signatureOf}'s mtimes: `.claude/` and its three
 * subdirectories, `settings.json` and `.mcp.json` — every site a project's own write would touch.
 */
@Injectable()
export class ClaudeProjectConfigFileReader implements ProjectConfigSource {
  private readonly cache = new Map<string, Cached>();

  async read(request: ProjectConfigReadRequest): Promise<ProjectConfigFileRead> {
    const signature = await signatureOf(request.folderPath);
    const cached = this.cache.get(request.folderPath);
    if (cached !== undefined && cached.signature === signature) {
      return this.withMemoryFiles(cached.read, request);
    }

    const read = await this.readFresh(request);
    this.cache.set(request.folderPath, { signature, read });
    return read;
  }

  /** Memory `stat`s are never part of the cached signature — a file can change without `.claude/` moving. */
  private async withMemoryFiles(
    cached: ProjectConfigFileRead,
    request: ProjectConfigReadRequest,
  ): Promise<ProjectConfigFileRead> {
    return { ...cached, memoryFiles: await this.memoryFilesOf(request) };
  }

  private async memoryFilesOf(
    request: ProjectConfigReadRequest,
  ): Promise<Record<string, MemoryFileStat>> {
    const entries = await Promise.all(
      request.memoryFilePaths.map(
        async (filePath) =>
          [
            filePath,
            await memoryStatOf(filePath, request.allowlistRoot, request.homeConfigDir),
          ] as const,
      ),
    );
    return Object.fromEntries(entries);
  }

  private async readFresh(request: ProjectConfigReadRequest): Promise<ProjectConfigFileRead> {
    const issues: ProjectConfigIssue[] = [];

    const settingsRead = await readTextWithin(request.folderPath, SETTINGS_PATH);
    let hooks: readonly ProjectHookView[] = [];
    let permissions: ProjectPermissionsDeclaration = { allow: [], deny: [] };
    let plugins: ProjectPluginsDeclaration = {
      enabled: [],
      disabled: [],
      enableAllProjectMcpServers: false,
    };

    if (settingsRead !== null) {
      if ('issue' in settingsRead) {
        issues.push({ path: SETTINGS_PATH.join('/'), reason: settingsRead.issue });
      } else {
        try {
          const parsed: unknown = JSON.parse(settingsRead.content);
          if (isPlainObject(parsed)) {
            hooks = hooksOf(parsed);
            permissions = permissionsOf(parsed);
            plugins = pluginsOf(parsed);
          } else {
            issues.push({ path: SETTINGS_PATH.join('/'), reason: 'malformed' });
          }
        } catch {
          issues.push({ path: SETTINGS_PATH.join('/'), reason: 'malformed' });
        }
      }
    }

    const [commandFiles, agentFiles, outputStyleFiles, memoryFiles] = await Promise.all([
      commandFilesIn(request.folderPath),
      agentFilesIn(request.folderPath),
      outputStyleFilesIn(request.folderPath),
      this.memoryFilesOf(request),
    ]);

    return {
      memoryFiles,
      commandFiles,
      agentFiles,
      outputStyleFiles,
      hooks,
      permissions,
      plugins,
      issues,
    };
  }
}
