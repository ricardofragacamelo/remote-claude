import type { PluginManifest } from '@domain/engines/claude';

/** Why a directory's manifest could not be read — never thrown, always turned into `PLUGIN_PATH_INVALID`. */
export type PluginManifestReadError = 'notFound' | 'malformed';

/** A manifest, read and parsed, with the digest it reads as right now (B-27, S-128). */
export interface PluginManifestRead {
  readonly manifest: PluginManifest;
  readonly digest: string;
}

/**
 * Reads a plugin's own manifest, by directory (plan 13, B-27) — engine-specific, since the manifest
 * format and the directory layout it is read from (`.claude-plugin/plugin.json`, `commands/`,
 * `agents/`, `hooks/`, `skills/`, `.mcp.json`) are the Claude CLI's own, not a neutral concept the
 * core assumes. Declared here, in the extension's own application layer — unlike
 * {@link import('@application/mcp').ProjectMcpServersSource}, which the *core* declares because
 * `.mcp.json` approval is a core concept; a plugin is not.
 */
export interface PluginManifestReader {
  read(absolutePath: string): Promise<PluginManifestRead | PluginManifestReadError>;
}

export const PLUGIN_MANIFEST_READER = Symbol('PluginManifestReader');
