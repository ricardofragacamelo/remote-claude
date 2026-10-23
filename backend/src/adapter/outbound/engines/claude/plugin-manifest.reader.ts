import { promises as fs } from 'node:fs';
import path from 'node:path';

import { Injectable } from '@nestjs/common';

import type {
  PluginManifestRead,
  PluginManifestReadError,
  PluginManifestReader,
} from '@application/engines/claude';
import { digestOfPluginManifest } from '@domain/engines/claude';
import type { PluginManifest } from '@domain/engines/claude';
import type { ProjectMcpEntry } from '@domain/mcp';
import { isPlainObject } from '@shared/utils/plain-object';
import { stringField } from '@shared/utils/string-field';
import { mcpJsonEntriesOf, mcpServerMapEntriesOf } from './mcp-json-format';
import { readJsonWithin } from './plugin-fs-read';

const MANIFEST_PATH = ['.claude-plugin', 'plugin.json'];
const MCP_JSON_NAME = '.mcp.json';
const COMMANDS_DIR = 'commands';
const AGENTS_DIR = 'agents';
const SKILLS_DIR = 'skills';
const HOOKS_FILE = ['hooks', 'hooks.json'];
const SKILL_MANIFEST = 'SKILL.md';

/** The `.md` files directly inside [dir] (not recursive), by name without extension — `[]` if absent. */
async function markdownNamesIn(dir: string): Promise<readonly string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name.slice(0, -'.md'.length))
    .sort((a, b) => a.localeCompare(b));
}

/** The subdirectories of `skills/` that hold a `SKILL.md` — a skill of this plugin, by its folder name. */
async function skillNamesIn(dir: string): Promise<readonly string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const hasManifest = await fs
      .access(path.join(dir, entry.name, SKILL_MANIFEST))
      .then(() => true)
      .catch(() => false);
    if (hasManifest) {
      names.push(entry.name);
    }
  }
  return names.sort((a, b) => a.localeCompare(b));
}

/** How many hook entries `hooks/hooks.json` declares — `0` when absent, `1` when present but opaque. */
function hookCountOf(parsed: unknown): number {
  if (!isPlainObject(parsed)) {
    return 1;
  }
  const events = isPlainObject(parsed['hooks']) ? parsed['hooks'] : parsed;
  let count = 0;
  for (const value of Object.values(events)) {
    if (Array.isArray(value)) {
      count += value.length;
    }
  }
  return count > 0 ? count : 1;
}

/** The `mcpServers` a manifest declares: its own inline map, else a sibling `.mcp.json`, else none. */
async function mcpServersOf(
  root: string,
  manifestJson: Record<string, unknown>,
): Promise<readonly ProjectMcpEntry[]> {
  const inline = mcpServerMapEntriesOf(manifestJson['mcpServers']);
  if (inline !== null) {
    return inline;
  }

  const parsed = await readJsonWithin(root, [MCP_JSON_NAME]).catch(() => undefined);
  if (parsed === undefined) {
    return [];
  }
  return mcpJsonEntriesOf(parsed) ?? [];
}

/**
 * Reads a Claude Code plugin's manifest from its directory (plan 13, B-27): `.claude-plugin/plugin.json`
 * (required, at least a `name`), and — best-effort, by convention, never by the manifest naming a
 * custom path — `commands/`, `agents/`, `hooks/hooks.json`, `skills/`, and its MCP servers (its own
 * inline `mcpServers`, or a sibling `.mcp.json`). A directory whose layout does not match these
 * conventions still has its declared parts read as empty, never refused — only a missing or
 * unparsable `plugin.json` itself is `notFound`/`malformed`.
 */
@Injectable()
export class ClaudePluginManifestReader implements PluginManifestReader {
  async read(absolutePath: string): Promise<PluginManifestRead | PluginManifestReadError> {
    let manifestJson: unknown;
    try {
      manifestJson = await readJsonWithin(absolutePath, MANIFEST_PATH);
    } catch {
      return 'malformed';
    }
    if (manifestJson === undefined) {
      return 'notFound';
    }
    if (!isPlainObject(manifestJson)) {
      return 'malformed';
    }

    const name = stringField(manifestJson['name']);
    if (name === null) {
      return 'malformed';
    }

    const [commands, agents, skills, hooksJson, mcpServers] = await Promise.all([
      markdownNamesIn(path.join(absolutePath, COMMANDS_DIR)),
      markdownNamesIn(path.join(absolutePath, AGENTS_DIR)),
      skillNamesIn(path.join(absolutePath, SKILLS_DIR)),
      readJsonWithin(absolutePath, HOOKS_FILE).catch(() => undefined),
      mcpServersOf(absolutePath, manifestJson),
    ]);

    const manifest: PluginManifest = {
      name,
      description: stringField(manifestJson['description']),
      version: stringField(manifestJson['version']),
      commands,
      agents,
      hookCount: hooksJson === undefined ? 0 : hookCountOf(hooksJson),
      skills,
      mcpServers,
    };

    return { manifest, digest: digestOfPluginManifest(manifest) };
  }
}
