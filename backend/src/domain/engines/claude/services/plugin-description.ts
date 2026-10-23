import type { PluginIdentity, PluginManifest } from '../entities/plugin.entity';

/**
 * A description in the same `messageKey` + `params` shape every por-extenso text of the product
 * uses (AGENTS.md rule 2; the same shape {@link import('@domain/mcp').McpServerDescription} has):
 * the client translates it, en and pt-BR, and never sees a sentence we composed in one language.
 */
export interface PluginDescription {
  readonly messageKey: string;
  readonly params: Readonly<Record<string, string | number | boolean>>;
}

/**
 * The "por extenso" of a plugin (plan 13, B-27; S-125): what it brings — commands, agents, hooks,
 * skills, MCP servers — and where it loads from. Pure and total, the same {@link PluginManifest}
 * and {@link PluginIdentity} always yield the same description, so the preview the second step
 * shows and the description the write records never diverge (the same guarantee B-18's
 * `describeMcpServer` gives the MCP screen).
 */
export function describePlugin(
  identity: PluginIdentity,
  manifest: PluginManifest,
): PluginDescription {
  return {
    messageKey: 'engines.claude.plugin.descriptionLocal',
    params: {
      name: manifest.name,
      path: identity.path,
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
    },
  };
}
