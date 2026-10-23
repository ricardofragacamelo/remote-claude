import type { ProjectMcpEntry } from '@domain/mcp';
import { isPlainObject } from '@shared/utils/plain-object';

/**
 * Parses the `mcpServers` map of a `.mcp.json`-shaped document into the neutral
 * {@link ProjectMcpEntry} shape — shared between `.claude-plugin/plugin.json`/`.mcp.json` readers
 * (project `.mcp.json`, B-24; a plugin's own servers, B-27), since both are the Claude CLI's own
 * `mcpServers` map format and parsing it twice would be the same code drifting in two places.
 */

function pairsOf(
  value: unknown,
): readonly { readonly name: string; readonly value: string }[] | null {
  if (value === undefined) {
    return [];
  }
  if (!isPlainObject(value)) {
    return null;
  }

  const pairs: { name: string; value: string }[] = [];
  for (const [name, raw] of Object.entries(value)) {
    if (typeof raw !== 'string') {
      return null;
    }
    pairs.push({ name, value: raw });
  }
  return pairs;
}

function remoteEntryOf(
  name: string,
  transport: 'http' | 'sse',
  raw: Record<string, unknown>,
): ProjectMcpEntry | null {
  const url = raw['url'];
  const headers = pairsOf(raw['headers']);
  if (typeof url !== 'string' || headers === null) {
    return null;
  }
  return { name, transport, command: null, args: [], url, env: [], headers };
}

function stdioArgsOf(raw: unknown): readonly string[] | null {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw) || raw.some((arg) => typeof arg !== 'string')) {
    return null;
  }
  return raw as string[];
}

function stdioEntryOf(name: string, raw: Record<string, unknown>): ProjectMcpEntry | null {
  const command = raw['command'];
  const args = stdioArgsOf(raw['args']);
  const env = pairsOf(raw['env']);

  if (typeof command !== 'string' || args === null || env === null) {
    return null;
  }

  return { name, transport: 'stdio', command, args, url: null, env, headers: [] };
}

/** One entry of an `mcpServers` map, as the CLI's own file shape has it. */
function entryOf(name: string, raw: unknown): ProjectMcpEntry | null {
  if (!isPlainObject(raw)) {
    return null;
  }

  const type = raw['type'];
  if (type === 'http' || type === 'sse') {
    return remoteEntryOf(name, type, raw);
  }
  if (type !== undefined && type !== 'stdio') {
    return null;
  }

  return stdioEntryOf(name, raw);
}

/**
 * Every entry of an object keyed by server name, in the CLI's `mcpServers` map shape — or `null` the
 * moment one of them cannot be understood.
 */
export function mcpServerMapEntriesOf(mapValue: unknown): readonly ProjectMcpEntry[] | null {
  if (!isPlainObject(mapValue)) {
    return null;
  }

  const entries: ProjectMcpEntry[] = [];
  for (const [name, raw] of Object.entries(mapValue)) {
    const entry = entryOf(name, raw);
    if (entry === null) {
      return null;
    }
    entries.push(entry);
  }
  return entries;
}

/**
 * The `mcpServers` map of a parsed `.mcp.json` document (`{ "mcpServers": { … } }`) — or `null` when
 * the document has no such map, or one of its entries cannot be understood.
 */
export function mcpJsonEntriesOf(parsed: unknown): readonly ProjectMcpEntry[] | null {
  if (!isPlainObject(parsed)) {
    return null;
  }
  return mcpServerMapEntriesOf(parsed['mcpServers']);
}
