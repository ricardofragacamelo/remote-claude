/**
 * The address of the agent settings screen — plan 13, B-41, B-44.
 *
 * Shared by every spec that opens a section of it, directly or through a folder's own link: the
 * same three lines, never copied byte for byte into a second spec, which is exactly what the
 * duplication gate (`pnpm lint:dup`) is for (the same reason `mcpSettingsAddress` lives in
 * `project-mcp.ts`, one section earlier).
 *
 * `engine` defaults to `'claude'` — every spec of this plan but one: B-45's own proof that the
 * screen is the core's, not Claude's, opens the test engine of [28 · F7](../../docs/plans/28-agent-neutral-core/F7-e2e.md)
 * at this same address with `'test'` instead (S-195).
 */
export function settingsAddress(section: string, folder?: string, engine = 'claude'): string {
  const search = new URLSearchParams({ section });
  if (folder !== undefined) {
    search.set('folder', folder);
  }
  return `/settings/agents/${engine}?${search.toString()}`;
}
