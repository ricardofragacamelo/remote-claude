/**
 * The address of the agent settings screen — plan 13, B-41, B-44.
 *
 * Shared by every spec that opens a section of it, directly or through a folder's own link: the
 * same three lines, never copied byte for byte into a second spec, which is exactly what the
 * duplication gate (`pnpm lint:dup`) is for (the same reason `mcpSettingsAddress` lives in
 * `project-mcp.ts`, one section earlier).
 */
export function settingsAddress(section: string, folder?: string): string {
  const search = new URLSearchParams({ section });
  if (folder !== undefined) {
    search.set('folder', folder);
  }
  return `/settings/agents/claude?${search.toString()}`;
}
