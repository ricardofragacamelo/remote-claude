import type { PluginOrigin, PluginState } from './plugin.entity';

/**
 * One plugin a marketplace's own `.claude-plugin/marketplace.json` lists (plan 13, B-47).
 *
 * `supported` is `false` for an entry whose `source` is not the one shape this product clones — a
 * relative path to a subdirectory of the same marketplace repository (D-68): a marketplace entry
 * that points at a second git repository, or at any other kind of source, is still shown (a
 * marketplace screen can say "this plugin isn't installable here yet"), but can never be installed
 * — `PLUGIN_PATH_INVALID` if it is tried.
 */
export interface MarketplacePluginEntry {
  readonly name: string;
  readonly description: string | null;
  readonly supported: boolean;
}

/** What a marketplace's own manifest declares (plan 13, B-47): its name, and the plugins it lists. */
export interface MarketplaceManifest {
  readonly name: string;
  readonly plugins: readonly MarketplacePluginEntry[];
}

/**
 * Where a plugin's state sits once a marketplace's own standing is taken into account (plan 13,
 * B-47, S-213): `marketplaceNotAllowed` overrides whatever {@link import('./plugin.entity').pluginStateOf}
 * says — a plugin whose marketplace left the allowlist file is not "current" or "changed", it is a
 * plugin nothing may compose into a new session any more, and the screen has to say so distinctly
 * from either of those two.
 *
 * A local plugin (`origin: 'local'`) is never affected: it has no marketplace to lose.
 */
export function effectivePluginState(
  plugin: { readonly origin: PluginOrigin; readonly marketplace: string | null },
  marketplaceAllowed: boolean,
  digestState: Exclude<PluginState, 'marketplaceNotAllowed'>,
): PluginState {
  if (plugin.origin === 'marketplace' && !marketplaceAllowed) {
    return 'marketplaceNotAllowed';
  }
  return digestState;
}
