import { createHash } from 'node:crypto';

import type { ProjectMcpEntry } from '@domain/mcp';
import type { PluginManifest } from '../entities/plugin.entity';

/** By name, for a stable comparison regardless of the order a manifest happened to list them in. */
function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function sortedEntries(entries: readonly ProjectMcpEntry[]): readonly ProjectMcpEntry[] {
  return [...entries].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The digest a plugin's approval is keyed on (plan 13, B-27; S-128) — the same reasoning
 * {@link import('@domain/mcp').digestOfProjectMcpEntry} already documents for a project's `.mcp.json`
 * entry: a manifest rewritten with the same fields in a different order digests the same and stays
 * approved; a manifest that declares something different — a new command, a hook added, a different
 * MCP server — digests differently and goes back to pending review.
 *
 * `name` is part of it, unlike the MCP entry's digest: here `name` is not a lookup key (the lookup
 * key is the plugin's directory path), it is a fact the manifest declares, and a plugin renamed in
 * place is a plugin that changed.
 */
export function digestOfPluginManifest(manifest: PluginManifest): string {
  const canonical = {
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    commands: sorted(manifest.commands),
    agents: sorted(manifest.agents),
    hookCount: manifest.hookCount,
    skills: sorted(manifest.skills),
    mcpServers: sortedEntries(manifest.mcpServers),
  };

  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
