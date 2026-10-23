import type {
  ClaudePluginMarketplaceCatalogPayloadPluginsItem,
  ClaudePluginPreviewPayload,
  ClaudePluginUpdatePreviewPayload,
  EnginePlugin,
  EnginePluginManifest,
  EnginePluginManifestDiff,
} from '@remote-claude/contracts';

/** One plugin of the caller, local or from a marketplace (plan 13, B-27, B-47, B-29). */
export type PluginView = EnginePlugin;

/** `local` or `marketplace` — where a plugin's content comes from. */
export type PluginOrigin = PluginView['origin'];

/** `current`, `changed`, `unreadable` or `marketplaceNotAllowed` (D-73). */
export type PluginState = PluginView['state'];

/** What a plugin's manifest declares, read fresh — names only (B-27). */
export type PluginManifestView = EnginePluginManifest;

/** What an available update would change — names added or removed per category (B-47, S-205). */
export type PluginManifestDiffView = EnginePluginManifestDiff;

/** The description a local-plugin `preview` would record, word for word (S-125). */
export type PluginPreview = ClaudePluginPreviewPayload;

/** Whether a marketplace plugin has an update, and what it would change (S-205). */
export type PluginUpdateCheck = ClaudePluginUpdatePreviewPayload;

/** One plugin of a marketplace's own catalogue — never the full manifest (B-47). */
export type MarketplaceCatalogEntry = ClaudePluginMarketplaceCatalogPayloadPluginsItem;
