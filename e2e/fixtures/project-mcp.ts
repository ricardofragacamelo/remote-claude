import fs from 'node:fs';
import path from 'node:path';

import { expect } from '@playwright/test';
import type { Page, Response } from '@playwright/test';

import { callApi } from './api';
import type { AuthenticatedUser } from './auth';

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

/** One server of the user's own store (never a project's `.mcp.json`), by its name. */
export interface StoredMcpServer {
  readonly id: string;
  readonly name: string;
}

/**
 * The server named `name` in the user's own store — `undefined` once removed or never added.
 *
 * Shared by every spec that adds a fixture server of its own and has to find or clean it up
 * afterwards (B-42, B-45) — the same lookup, never copied a second time (`pnpm lint:dup`).
 */
export async function storedMcpServer(
  user: AuthenticatedUser,
  name: string,
): Promise<StoredMcpServer | undefined> {
  const response = await callApi(user, '/engines/claude/mcp-servers');
  expect(response.status).toBe(200);
  const body = (await response.json()) as { servers: readonly StoredMcpServer[] };
  return body.servers.find((server) => server.name === name);
}

/** Leaves no server named `name` behind, whether or not the spec that added it reached its end cleanly. */
export async function removeMcpServerNamed(user: AuthenticatedUser, name: string): Promise<void> {
  const server = await storedMcpServer(user, name);
  if (server !== undefined) {
    const response = await callApi(user, `/engines/claude/mcp-servers/${server.id}`, {
      method: 'DELETE',
    });
    expect([204, 404]).toContain(response.status);
  }
}

/**
 * The confirmed write of an "Add server" wizard's own second step — `confirm` is whatever presses
 * "Confirm", a click or a keystroke, so a mouse spec (B-42) and a keyboard-only one (B-45) share the
 * same wait for the response instead of each copying it (`pnpm lint:dup`).
 */
export async function serverCreated(page: Page, confirm: () => Promise<void>): Promise<Response> {
  const [created] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith('/engines/claude/mcp-servers') &&
        response.request().method() === 'POST',
    ),
    confirm(),
  ]);
  return created;
}
