import { promises as fs } from 'node:fs';
import path from 'node:path';

import { Injectable } from '@nestjs/common';

import type {
  ProjectMcpClimbRequest,
  ProjectMcpFileError,
  ProjectMcpFileRead,
  ProjectMcpServersSource,
} from '@application/mcp';
import { mcpJsonEntriesOf } from './mcp-json-format';
import { isWithinRoot } from './within-root';

/** A `.mcp.json` larger than this is not read at all — a project file, not a data dump. */
const MAX_MCP_JSON_BYTES = 65_536;

const FILE_NAME = '.mcp.json';
const VCS_ROOT_MARKER = '.git';

function failed(folderPath: string, error: ProjectMcpFileError): ProjectMcpFileRead {
  return { folderPath, entries: [], error };
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
      if (!isWithinRoot(parentReal, rootReal)) {
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

    if (!isWithinRoot(real, rootReal)) {
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

    const entries = mcpJsonEntriesOf(parsed);
    if (entries === null) {
      return failed(folder, 'malformed');
    }

    return { folderPath: folder, entries, error: null };
  }
}
