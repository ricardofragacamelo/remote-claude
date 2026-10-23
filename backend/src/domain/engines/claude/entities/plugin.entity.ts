import type { ProjectMcpEntry } from '@domain/mcp';

/**
 * Where a plugin came from (plan 13, D-15): a local directory the user picked, or one a declared
 * marketplace gave (B-47). Both ever only `type: 'local'` to the SDK — a marketplace plugin is
 * downloaded by the backend first, then loaded the same way a local one is.
 */
export const PLUGIN_ORIGINS = ['local', 'marketplace'] as const;
export type PluginOrigin = (typeof PLUGIN_ORIGINS)[number];

/** Which directory loads, and — for a marketplace plugin — where it came from and at what commit. */
export interface PluginIdentity {
  readonly origin: PluginOrigin;
  readonly path: string;
  readonly marketplace: string | null;
  readonly commit: string | null;
}

/**
 * What a plugin's manifest declares (plan 13, B-27; S-125) — read fresh every time a caller needs
 * to know what a plugin brings, never cached past the read that produced it. Hooks are reported
 * only as a count: this screen shows that a plugin carries code that runs on every event, not what
 * that code is — reading it would be parsing a manifest format of the engine's own, which is
 * exactly what the preview is already allowed to do once (B-18 does the same for the MCP
 * description); further detail belongs to whoever looks at the file itself.
 */
export interface PluginManifest {
  readonly name: string;
  readonly description: string | null;
  readonly version: string | null;
  readonly commands: readonly string[];
  readonly agents: readonly string[];
  readonly hookCount: number;
  readonly skills: readonly string[];
  readonly mcpServers: readonly ProjectMcpEntry[];
}

/** `^[A-Za-z0-9_-]{1,64}$` — the same universal name shape the MCP domain already uses (B-18). */
export const PLUGIN_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Where a plugin stands against what was approved when it was added or last re-approved (S-128), or
 * against the allowlist file for one that came from a marketplace (plan 13, B-47, S-213).
 */
export const PLUGIN_STATES = ['current', 'changed', 'unreadable', 'marketplaceNotAllowed'] as const;
export type PluginState = (typeof PLUGIN_STATES)[number];

/**
 * `current` when the manifest reads exactly as it did at approval; `changed` when it still reads,
 * but differently (a `git pull` that rewrote it — the entry goes back to pending review, S-128);
 * `unreadable` when it cannot be read at all any more (the directory moved, the manifest no longer
 * parses) — a state of its own, not folded into `changed`, because there is nothing to compare the
 * approved digest against.
 *
 * Never answers `marketplaceNotAllowed` — that one is not about the manifest at all, and is laid
 * over whichever of these three this function answers (see
 * {@link import('./marketplace-plugin.entity').effectivePluginState}).
 */
export function pluginStateOf(
  approvedDigest: string,
  current: { readonly digest: string } | null,
): Exclude<PluginState, 'marketplaceNotAllowed'> {
  if (current === null) {
    return 'unreadable';
  }
  return current.digest === approvedDigest ? 'current' : 'changed';
}
