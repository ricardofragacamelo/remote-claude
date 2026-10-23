/**
 * A plugin marketplace the shared allowlist file declares (plan 13, B-47; D-15) — the same file,
 * the same boot discipline and the same `SIGHUP` reload as a workspace root. Declared here, in the
 * core, for the same reason {@link import('@application/session').SessionExtensionPathsSource} is:
 * nothing about "marketplace" or "plugin" belongs to an engine by itself — a marketplace is just a
 * declared source the backend may clone from, and today only one engine's extension has anything
 * that reads one. The core never asks what a marketplace is *for*; it only ever hands this shape
 * back to whichever extension asked for it by name.
 */
export interface DeclaredMarketplace {
  readonly name: string;
  readonly source: {
    readonly type: 'git';
    readonly url: string;
  };
}

/**
 * Where the current set of declared marketplaces comes from.
 *
 * Read on **every** use, never captured once: the same reasoning
 * {@link import('./workspace-allowlist.port').WorkspaceAllowlistSource} already documents for roots
 * — a marketplace removed by a `SIGHUP` reload has to stop being found the next time anybody asks,
 * without any extension needing to listen for the change itself (plan 13, S-213).
 */
export interface MarketplaceAllowlistSource {
  /** Every marketplace the file currently declares, in the order it declares them. */
  list(): readonly DeclaredMarketplace[];

  /** The marketplace of that name, or `null` when it is not (or no longer) declared. */
  find(name: string): DeclaredMarketplace | null;
}

export const MARKETPLACE_ALLOWLIST_SOURCE = Symbol('MarketplaceAllowlistSource');
