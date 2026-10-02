/**
 * The name on the internal bus of "the allowlist was reloaded". `<module>.<fact in the past>`, like
 * every event on the bus.
 */
export const WORKSPACE_ALLOWLIST_RELOADED = 'workspace.allowlistReloaded';

/**
 * What a reload of the allowlist changed, by real path of root.
 *
 * Shared vocabulary rather than a port: the reload is the configuration's, and whoever holds
 * something a root allowed — the folders `files` watches (plan 07, S-143) — asks again, through its
 * own port, whether it still may. A root whose users changed is in neither list, which is why a
 * listener revalidates on every reload rather than only on `removed`.
 */
export interface WorkspaceAllowlistReloaded {
  readonly added: readonly string[];
  readonly removed: readonly string[];
}
