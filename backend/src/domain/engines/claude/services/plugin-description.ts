import type { PluginIdentity, PluginManifest } from '../entities/plugin.entity';
import type { PluginManifestDiff } from './plugin-manifest-diff';

/**
 * A description in the same `messageKey` + `params` shape every por-extenso text of the product
 * uses (AGENTS.md rule 2; the same shape {@link import('@domain/mcp').McpServerDescription} has):
 * the client translates it, en and pt-BR, and never sees a sentence we composed in one language.
 */
export interface PluginDescription {
  readonly messageKey: string;
  readonly params: Readonly<Record<string, string | number | boolean>>;
}

/** The first 12 characters of a commit — enough to tell two commits apart on a screen. */
function shortCommit(commit: string): string {
  return commit.slice(0, 12);
}

function manifestParams(manifest: PluginManifest): Record<string, string | number | boolean> {
  return {
    name: manifest.name,
    commandCount: manifest.commands.length,
    commandNames: manifest.commands.join(', '),
    agentCount: manifest.agents.length,
    agentNames: manifest.agents.join(', '),
    hasHooks: manifest.hookCount > 0,
    hookCount: manifest.hookCount,
    skillCount: manifest.skills.length,
    skillNames: manifest.skills.join(', '),
    mcpServerCount: manifest.mcpServers.length,
    mcpServerNames: manifest.mcpServers.map((server) => server.name).join(', '),
  };
}

/**
 * The "por extenso" of a plugin (plan 13, B-27, B-47; S-125): what it brings — commands, agents,
 * hooks, skills, MCP servers — and where it loads from, worded differently for a local directory
 * than for a marketplace download (its own commit, and the marketplace it came from, matter here —
 * a local plugin has neither). Pure and total, the same {@link PluginManifest} and
 * {@link PluginIdentity} always yield the same description, so the preview the second step shows
 * and the description the write records never diverge (the same guarantee B-18's
 * `describeMcpServer` gives the MCP screen).
 */
export function describePlugin(
  identity: PluginIdentity,
  manifest: PluginManifest,
): PluginDescription {
  if (identity.origin === 'marketplace') {
    return {
      messageKey: 'engines.claude.plugin.descriptionMarketplace',
      params: {
        ...manifestParams(manifest),
        marketplace: identity.marketplace ?? '',
        commit: identity.commit === null ? '' : shortCommit(identity.commit),
      },
    };
  }

  return {
    messageKey: 'engines.claude.plugin.descriptionLocal',
    params: { ...manifestParams(manifest), path: identity.path },
  };
}

/**
 * The "por extenso" of an update a marketplace plugin would apply (plan 13, B-47; S-205): never
 * shown without the second step, and the one text that names what specifically changes —
 * everything a {@link PluginManifestDiff} carries, so the preview and the audit record of the
 * update that follows it are, again, the same sentence.
 */
export function describePluginUpdate(
  identity: { readonly marketplace: string | null },
  name: string,
  fromCommit: string,
  toCommit: string,
  diff: PluginManifestDiff,
): PluginDescription {
  return {
    messageKey: 'engines.claude.plugin.descriptionUpdate',
    params: {
      name,
      marketplace: identity.marketplace ?? '',
      fromCommit: shortCommit(fromCommit),
      toCommit: shortCommit(toCommit),
      commandsAddedCount: diff.commandsAdded.length,
      commandsAddedNames: diff.commandsAdded.join(', '),
      commandsRemovedCount: diff.commandsRemoved.length,
      commandsRemovedNames: diff.commandsRemoved.join(', '),
      agentsAddedCount: diff.agentsAdded.length,
      agentsAddedNames: diff.agentsAdded.join(', '),
      agentsRemovedCount: diff.agentsRemoved.length,
      agentsRemovedNames: diff.agentsRemoved.join(', '),
      skillsAddedCount: diff.skillsAdded.length,
      skillsAddedNames: diff.skillsAdded.join(', '),
      skillsRemovedCount: diff.skillsRemoved.length,
      skillsRemovedNames: diff.skillsRemoved.join(', '),
      mcpServersAddedCount: diff.mcpServersAdded.length,
      mcpServersAddedNames: diff.mcpServersAdded.join(', '),
      mcpServersRemovedCount: diff.mcpServersRemoved.length,
      mcpServersRemovedNames: diff.mcpServersRemoved.join(', '),
      hookCountBefore: diff.hookCountBefore,
      hookCountAfter: diff.hookCountAfter,
    },
  };
}
