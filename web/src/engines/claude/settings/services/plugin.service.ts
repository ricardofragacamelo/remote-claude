import type {
  ClaudePluginListPayload,
  ClaudePluginMarketplaceCatalogPayload,
  ClaudePluginMarketplaceListPayload,
  EnginePlugin,
} from '@remote-claude/contracts';

import { api } from '@/shared/api';
import type { PluginPreview, PluginUpdateCheck } from '../types/plugin';

const PLUGINS = '/engines/claude/plugins';

/** `GET /engines/claude/plugins` — every plugin of the caller, local and from a marketplace. */
export async function fetchPlugins(): Promise<readonly EnginePlugin[]> {
  return (await api.get<ClaudePluginListPayload>(PLUGINS)).plugins;
}

/**
 * `POST /engines/claude/plugins/preview` — what a local directory would bring, word for word, before
 * the second step (S-125, S-137).
 */
export function previewLocalPlugin(path: string): Promise<PluginPreview> {
  return api.post<PluginPreview>(`${PLUGINS}/preview`, { path });
}

/** `POST /engines/claude/plugins` — adding a local plugin, only after the preview was confirmed. */
export function addLocalPlugin(path: string): Promise<EnginePlugin> {
  return api.post<EnginePlugin>(PLUGINS, { path });
}

/**
 * `POST /engines/claude/plugins/marketplace` — installing a plugin of a declared marketplace
 * (plan 13, B-47). There is no separate preview route for this one: the manifest a marketplace
 * plugin brings is only known once it is actually fetched, which is what this call does (D-90).
 */
export function installMarketplacePlugin(
  marketplace: string,
  plugin: string,
): Promise<EnginePlugin> {
  return api.post<EnginePlugin>(`${PLUGINS}/marketplace`, { marketplace, plugin });
}

/** `PATCH /engines/claude/plugins/:id` — turning a plugin on or off. */
export function setPluginEnabled(id: string, enabled: boolean): Promise<EnginePlugin> {
  return api.patch<EnginePlugin>(`${PLUGINS}/${id}`, { enabled });
}

/** `DELETE /engines/claude/plugins/:id` — removing a plugin for good. */
export function removePlugin(id: string): Promise<void> {
  return api.delete<void>(`${PLUGINS}/${id}`);
}

/** `GET /engines/claude/plugins/:id/update` — whether an update is available, and its diff (S-205). */
export function fetchPluginUpdate(id: string): Promise<PluginUpdateCheck> {
  return api.get<PluginUpdateCheck>(`${PLUGINS}/${id}/update`);
}

/** `POST /engines/claude/plugins/:id/update` — applying an update already shown (S-205). */
export function applyPluginUpdate(id: string): Promise<EnginePlugin> {
  return api.post<EnginePlugin>(`${PLUGINS}/${id}/update`, {});
}

/** `GET /engines/claude/plugins/marketplaces` — every marketplace this installation declares. */
export function fetchMarketplaces(): Promise<ClaudePluginMarketplaceListPayload> {
  return api.get<ClaudePluginMarketplaceListPayload>(`${PLUGINS}/marketplaces`);
}

/** `GET /engines/claude/plugins/marketplaces/:name` — what one declared marketplace lists. */
export function fetchMarketplaceCatalog(
  name: string,
): Promise<ClaudePluginMarketplaceCatalogPayload> {
  return api.get<ClaudePluginMarketplaceCatalogPayload>(
    `${PLUGINS}/marketplaces/${encodeURIComponent(name)}`,
  );
}
