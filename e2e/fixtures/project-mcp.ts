import fs from 'node:fs';
import path from 'node:path';

/**
 * A project's own `.mcp.json`, from the outside — plan 13, B-24, B-42, B-43.
 *
 * Shared by every spec that touches a project's own MCP file or its approval screen: the same
 * address, and a real, spawnable file written straight to disk the way the CLI itself climbs for
 * one — never copied byte for byte into a second spec, which is exactly what the duplication gate
 * (`pnpm lint:dup`) is for.
 */

/** The address of the MCP servers section of the agent settings, for Claude, in one folder. */
export function mcpSettingsAddress(folder: string): string {
  return `/settings/agents/claude?${new URLSearchParams({ section: 'mcp', folder }).toString()}`;
}

/**
 * Writes a real, spawnable `.mcp.json` of one stdio server at `folder` — the D-19 fixture
 * (`e2e/fixtures/mcp-server/fixture-mcp-server.mjs`), under the command line given.
 */
export function writeProjectMcpJson(
  folder: string,
  serverName: string,
  args: readonly string[],
): void {
  fs.writeFileSync(
    path.join(folder, '.mcp.json'),
    JSON.stringify({ mcpServers: { [serverName]: { command: 'node', args: [...args] } } }, null, 2),
  );
}
