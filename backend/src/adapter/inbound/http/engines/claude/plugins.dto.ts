import { z } from 'zod';

import type {
  ClaudePluginListPayload,
  ClaudePluginMarketplaceCatalogPayload,
  ClaudePluginMarketplaceListPayload,
  ClaudePluginPreviewPayload,
  ClaudePluginUpdatePreviewPayload,
  EnginePlugin,
  EnginePluginManifest,
  EnginePluginManifestDiff,
} from '@remote-claude/contracts';
import type {
  LocalPluginPreview,
  MarketplacePluginUpdateCheck,
  PluginView,
} from '@application/engines/claude';
import type {
  MarketplaceManifest,
  PluginDescription,
  PluginManifest,
  PluginManifestDiff,
} from '@domain/engines/claude';
import { folderField } from '../../agent-settings/agent-settings.dto';

/** `POST /engines/claude/plugins/preview`, `POST /engines/claude/plugins` — a local directory. */
export const localPluginPathSchema = z.object({ path: folderField }).strict();
export type LocalPluginPathBody = z.infer<typeof localPluginPathSchema>;

/** `PATCH /engines/claude/plugins/:id`. */
export const setPluginEnabledSchema = z.object({ enabled: z.boolean() }).strict();
export type SetPluginEnabledBody = z.infer<typeof setPluginEnabledSchema>;

/** `POST /engines/claude/plugins/marketplace` — which declared marketplace, and which of its plugins. */
export const installMarketplacePluginSchema = z
  .object({ marketplace: z.string().min(1), plugin: z.string().min(1) })
  .strict();
export type InstallMarketplacePluginBody = z.infer<typeof installMarketplacePluginSchema>;

function toManifestDto(manifest: PluginManifest): EnginePluginManifest {
  return {
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    commands: [...manifest.commands],
    agents: [...manifest.agents],
    hookCount: manifest.hookCount,
    skills: [...manifest.skills],
    mcpServerNames: manifest.mcpServers.map((server) => server.name),
  };
}

function stringParamsOf(description: PluginDescription): Record<string, string> {
  return Object.fromEntries(
    Object.entries(description.params).map(([key, value]) => [key, String(value)]),
  );
}

export function toPluginDto(view: PluginView): EnginePlugin {
  return {
    id: view.id,
    origin: view.origin,
    path: view.path,
    marketplace: view.marketplace,
    commit: view.commit,
    name: view.name,
    state: view.state,
    enabled: view.enabled,
    manifest: view.manifest === null ? null : toManifestDto(view.manifest),
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
  };
}

export function toPluginListDto(views: readonly PluginView[]): ClaudePluginListPayload {
  return { plugins: views.map(toPluginDto) };
}

export function toPluginPreviewDto(preview: LocalPluginPreview): ClaudePluginPreviewPayload {
  return {
    manifest: toManifestDto(preview.manifest),
    messageKey: preview.description.messageKey,
    params: stringParamsOf(preview.description),
  };
}

/** `GET /engines/claude/plugins/marketplaces` — plan 13, B-47. */
export function toMarketplaceListDto(
  marketplaces: readonly { readonly name: string }[],
): ClaudePluginMarketplaceListPayload {
  return { marketplaces: marketplaces.map((marketplace) => ({ name: marketplace.name })) };
}

/** `GET /engines/claude/plugins/marketplaces/:name` — plan 13, B-47. */
export function toMarketplaceCatalogDto(
  manifest: MarketplaceManifest,
): ClaudePluginMarketplaceCatalogPayload {
  return {
    name: manifest.name,
    plugins: manifest.plugins.map((entry) => ({
      name: entry.name,
      description: entry.description,
      supported: entry.supported,
    })),
  };
}

function toManifestDiffDto(diff: PluginManifestDiff): EnginePluginManifestDiff {
  return {
    commandsAdded: [...diff.commandsAdded],
    commandsRemoved: [...diff.commandsRemoved],
    agentsAdded: [...diff.agentsAdded],
    agentsRemoved: [...diff.agentsRemoved],
    skillsAdded: [...diff.skillsAdded],
    skillsRemoved: [...diff.skillsRemoved],
    mcpServersAdded: [...diff.mcpServersAdded],
    mcpServersRemoved: [...diff.mcpServersRemoved],
    hookCountBefore: diff.hookCountBefore,
    hookCountAfter: diff.hookCountAfter,
  };
}

/** `GET /engines/claude/plugins/:id/update` — plan 13, B-47, S-205. */
export function toUpdatePreviewDto(
  check: MarketplacePluginUpdateCheck,
): ClaudePluginUpdatePreviewPayload {
  return {
    available: check.available,
    newCommit: check.newCommit,
    diff: check.diff === null ? null : toManifestDiffDto(check.diff),
  };
}
