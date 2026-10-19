import { promises as fs } from 'node:fs';
import path from 'node:path';

import { Injectable } from '@nestjs/common';

import type {
  ProjectMcpClimbRequest,
  ProjectMcpFileError,
  ProjectMcpFileRead,
  ProjectMcpServersSource,
} from '@application/mcp';
import { WorkspacePath } from '@domain/workspace';
import type { ProjectMcpEntry } from '@domain/mcp';
import { isPlainObject } from '@shared/utils/plain-object';

/** A `.mcp.json` larger than this is not read at all — a project file, not a data dump. */
const MAX_MCP_JSON_BYTES = 65_536;

const FILE_NAME = '.mcp.json';
const VCS_ROOT_MARKER = '.git';

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

/** One entry of the `mcpServers` map, as the CLI's own file shape has it. */
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

/** Every entry of `mcpServers`, or `null` the moment one of them cannot be understood. */
function entriesOf(parsed: unknown): readonly ProjectMcpEntry[] | null {
  if (!isPlainObject(parsed) || !isPlainObject(parsed['mcpServers'])) {
    return null;
  }

  const entries: ProjectMcpEntry[] = [];
  for (const [name, raw] of Object.entries(parsed['mcpServers'])) {
    const entry = entryOf(name, raw);
    if (entry === null) {
      return null;
    }
    entries.push(entry);
  }
  return entries;
}

function failed(folderPath: string, error: ProjectMcpFileError): ProjectMcpFileRead {
  return { folderPath, entries: [], error };
}

function isWithin(candidate: string, root: string): boolean {
  return WorkspacePath.create(candidate).isWithin(WorkspacePath.create(root));
}

/**
 * Reads the Claude CLI's own project MCP file, `.mcp.json` (plan 13, B-24; D-11).
 *
 * Climbing mirrors what was measured of the CLI itself
 * (docs/discovery/01-descoberta-claude-agent-sdk.md#11--quinta-rodada-de-spikes-2026-10-09, #10):
 * from the folder a session opens in, up to the first directory holding a `.git`, never past the
 * allowlist root. A link at the end of the path, or on the way to the folder itself, that resolves
 * outside that root is refused exactly like the rest of the product refuses one (S-106) — a
 * lighter check than `FolderFence`'s, because this is one point-in-time read for display, never a
 * write and never raced against a concurrent rewrite of the same file.
 */
@Injectable()
export class ClaudeProjectMcpFileReader implements ProjectMcpServersSource {
  async climb(request: ProjectMcpClimbRequest): Promise<readonly ProjectMcpFileRead[]> {
    const rootReal = await this.realOrSelf(request.allowlistRoot);
    const results: ProjectMcpFileRead[] = [];
    let current = request.folder;

    for (;;) {
      const read = await this.readOneMcpJson(current, rootReal);
      if (read !== null) {
        results.push(read);
      }

      if (await this.hasVcsRoot(current)) {
        break;
      }

      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }

      const parentReal = await this.realOrSelf(parent);
      if (!isWithin(parentReal, rootReal)) {
        break;
      }

      current = parent;
    }

    return results;
  }

  async readAt(folderPath: string): Promise<ProjectMcpFileRead | null> {
    return this.readOneMcpJson(folderPath, await this.realOrSelf(folderPath));
  }

  private async hasVcsRoot(folder: string): Promise<boolean> {
    try {
      const stat = await fs.lstat(path.join(folder, VCS_ROOT_MARKER));
      return stat.isDirectory() || stat.isFile();
    } catch {
      return false;
    }
  }

  private async realOrSelf(candidate: string): Promise<string> {
    try {
      return await fs.realpath(candidate);
    } catch {
      return candidate;
    }
  }

  private async readOneMcpJson(
    folder: string,
    rootReal: string,
  ): Promise<ProjectMcpFileRead | null> {
    const filePath = path.join(folder, FILE_NAME);
    let size: number;

    try {
      size = (await fs.lstat(filePath)).size;
    } catch {
      return null;
    }

    if (size > MAX_MCP_JSON_BYTES) {
      return failed(folder, 'tooLarge');
    }

    let real: string;
    try {
      real = await fs.realpath(filePath);
    } catch {
      return failed(folder, 'malformed');
    }

    if (!isWithin(real, rootReal)) {
      return failed(folder, 'linkEscapesRoot');
    }

    let raw: string;
    try {
      raw = await fs.readFile(real, 'utf8');
    } catch {
      return failed(folder, 'malformed');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return failed(folder, 'malformed');
    }

    const entries = entriesOf(parsed);
    if (entries === null) {
      return failed(folder, 'malformed');
    }

    return { folderPath: folder, entries, error: null };
  }
}
