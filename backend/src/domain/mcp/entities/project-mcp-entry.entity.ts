import { createHash } from 'node:crypto';

import type { McpEnvVar, McpHeader, McpTransport } from './mcp-server-config.entity';

/**
 * One server a project's own MCP file declares — the neutral shape every engine's reader
 * normalises its format into (plan 13, B-24; D-11). Unlike a server of our own store, nothing
 * here is a secret: a project file is plain text already in the repository, so `env` and `headers`
 * carry their value as written, `${VAR}` included literal — never encrypted, never redacted.
 */
export interface ProjectMcpEntry {
  readonly name: string;
  readonly transport: McpTransport;
  readonly command: string | null;
  readonly args: readonly string[];
  readonly url: string | null;
  readonly env: readonly McpEnvVar[];
  readonly headers: readonly McpHeader[];
}

/**
 * What an approval keeps of the entry it approved — everything but its name, which is the lookup
 * key the approval is already stored under (plan 13, B-28, D-80). Kept so a `changed` entry (D-11)
 * can be shown against what was actually approved, not only told that it differs: nothing secret,
 * the same reasoning {@link ProjectMcpEntry} itself already documents.
 */
export type ProjectMcpEntrySnapshot = Omit<ProjectMcpEntry, 'name'>;

/** [entry], without its name — what an approval keeps of it (D-80). */
export function snapshotOfProjectMcpEntry(entry: ProjectMcpEntry): ProjectMcpEntrySnapshot {
  return {
    transport: entry.transport,
    command: entry.command,
    args: entry.args,
    url: entry.url,
    env: entry.env,
    headers: entry.headers,
  };
}

/** By name, for a stable comparison regardless of how a file happened to list them. */
function sortedByName<T extends { readonly name: string }>(fields: readonly T[]): readonly T[] {
  return [...fields].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The digest an approval is keyed on (D-11): the normalised entry, not the file's own bytes — a
 * `.mcp.json` rewritten with the same fields in a different order, or reformatted, digests the
 * same and stays approved; any field that would actually change what runs digests differently.
 *
 * `name` is not part of it: name is the lookup key an approval is stored under, never the thing
 * that changed.
 *
 * `node:crypto` is used and is not I/O: it hashes a string already built in memory — the same
 * reasoning {@link import('@domain/files').Etag} already documents for itself.
 */
export function digestOfProjectMcpEntry(entry: ProjectMcpEntry): string {
  const canonical = {
    transport: entry.transport,
    command: entry.command,
    args: entry.args,
    url: entry.url,
    env: sortedByName(entry.env),
    headers: sortedByName(entry.headers),
  };

  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
