import type { PluginManifest } from '../entities/plugin.entity';

/**
 * What changed between two readings of a plugin's manifest (plan 13, B-47) — names added or
 * removed per category, and the hook count on each side. Enough to show "an update brings this",
 * without a line-level diff of any file: the spec is explicit that names are enough.
 */
export interface PluginManifestDiff {
  readonly commandsAdded: readonly string[];
  readonly commandsRemoved: readonly string[];
  readonly agentsAdded: readonly string[];
  readonly agentsRemoved: readonly string[];
  readonly skillsAdded: readonly string[];
  readonly skillsRemoved: readonly string[];
  readonly mcpServersAdded: readonly string[];
  readonly mcpServersRemoved: readonly string[];
  readonly hookCountBefore: number;
  readonly hookCountAfter: number;
}

/** [after] minus [before], sorted — what a plugin's new manifest brings that the old one did not. */
function added(before: readonly string[], after: readonly string[]): readonly string[] {
  const was = new Set(before);
  return after.filter((name) => !was.has(name)).sort((a, b) => a.localeCompare(b));
}

/** [before] minus [after], sorted — what the old manifest had that the new one drops. */
function removed(before: readonly string[], after: readonly string[]): readonly string[] {
  return added(after, before);
}

/**
 * The diff a plugin update's second step shows (S-205): pure, total, the same two manifests always
 * yielding the same diff — the same guarantee {@link import('./plugin-description').describePlugin}
 * already gives a plugin's own description.
 */
export function diffPluginManifests(
  before: PluginManifest,
  after: PluginManifest,
): PluginManifestDiff {
  const beforeMcp = before.mcpServers.map((server) => server.name);
  const afterMcp = after.mcpServers.map((server) => server.name);

  return {
    commandsAdded: added(before.commands, after.commands),
    commandsRemoved: removed(before.commands, after.commands),
    agentsAdded: added(before.agents, after.agents),
    agentsRemoved: removed(before.agents, after.agents),
    skillsAdded: added(before.skills, after.skills),
    skillsRemoved: removed(before.skills, after.skills),
    mcpServersAdded: added(beforeMcp, afterMcp),
    mcpServersRemoved: removed(beforeMcp, afterMcp),
    hookCountBefore: before.hookCount,
    hookCountAfter: after.hookCount,
  };
}
