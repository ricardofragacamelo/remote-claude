import type { MarketplacePluginEntry, PluginManifest } from '@domain/engines/claude';
import type { DeclaredMarketplace } from '@application/workspace';

/**
 * Why a marketplace (or a plugin inside it) could not be read or downloaded (plan 13, B-47) — never
 * thrown, always turned into the matching domain error by the use case that asked:
 *
 * - `unavailable`: the git source could not be reached, had no commit to resolve, or what it holds
 *   does not parse as a marketplace or a plugin manifest — `PLUGIN_SOURCE_UNAVAILABLE` (502);
 * - `pathInvalid`: the plugin's own `source` entry is of a kind this product does not clone, or
 *   resolves outside the marketplace's own repository — `PLUGIN_PATH_INVALID` (422);
 * - `pluginNotFound`: the marketplace does not list a plugin of that name — `PLUGIN_NOT_FOUND` (404).
 */
export type MarketplaceSourceFailure =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'pathInvalid'; readonly reason: string }
  | { readonly kind: 'pluginNotFound' };

/** A plugin's content, cloned and verified, waiting to be moved into place (plan 13, B-47). */
export interface PreparedMarketplacePlugin {
  readonly manifest: PluginManifest;
  readonly digest: string;
  readonly commit: string;
  /**
   * Where the plugin's own files sit right now — on the same filesystem as every destination this
   * engine ever installs a plugin to, so moving it into place ({@link MarketplacePluginSource.commit}
   * or {@link MarketplacePluginSource.swap}) is one atomic rename, never a copy across filesystems.
   */
  readonly stagedAt: string;
}

/**
 * Clones a declared marketplace's git source and hands back a plugin's files, never running
 * anything it downloads (plan 13, B-47; D-15, D-68) — no install script, no `claude plugin`, no
 * write under `~/.claude` (S-211). Declared in the extension's own application layer, like
 * {@link import('./plugin-manifest-reader.port').PluginManifestReader}: a marketplace's published
 * format, and the git mechanics to clone one, are the Claude CLI's own, not a neutral concept the
 * core assumes.
 */
export interface MarketplacePluginSource {
  /** Every plugin [source]'s marketplace.json lists, for browsing (plan 13, B-29 reads this). */
  listPlugins(
    source: DeclaredMarketplace['source'],
  ): Promise<readonly MarketplacePluginEntry[] | MarketplaceSourceFailure>;

  /**
   * The commit [source] currently resolves to, without cloning anything — cheap enough to call on
   * every "is there an update" check (plan 13, B-47; S-205).
   */
  resolveCommit(source: DeclaredMarketplace['source']): Promise<string | MarketplaceSourceFailure>;

  /**
   * Clones [source], verifies [pluginName]'s own manifest, and stages its files — but never moves
   * them into any final destination; the caller decides that only after the store has settled who
   * owns the install (S-208), by calling {@link commit}, {@link swap} or {@link discard}.
   */
  prepare(
    source: DeclaredMarketplace['source'],
    pluginName: string,
  ): Promise<PreparedMarketplacePlugin | MarketplaceSourceFailure>;

  /** Moves what {@link prepare} staged into [destination], which must not exist yet (a fresh install). */
  commit(stagedAt: string, destination: string): Promise<void>;

  /**
   * Replaces whatever is at [destination] with what {@link prepare} staged (an applied update):
   * atomic from the caller's point of view — [destination] holds the old content, or the new one,
   * never neither and never both.
   */
  swap(stagedAt: string, destination: string): Promise<void>;

  /** Discards what {@link prepare} staged, without installing it anywhere. Never throws. */
  discard(stagedAt: string): Promise<void>;
}

export const MARKETPLACE_PLUGIN_SOURCE = Symbol('MarketplacePluginSource');
