import { isClaudeSettingsSection } from '../types/claude-settings';
import type { ClaudeSettingsLocation } from '../types/claude-settings';

/**
 * The location of the screen, read from the search of its address — and only what is well formed.
 *
 * A section nobody knows is the first one; a folder that is not absolute is dropped. A hand-edited
 * link shows the screen it can, never an error the person did not cause by clicking.
 */
export function readClaudeSettingsSearch(
  search: Readonly<Record<string, unknown>>,
): ClaudeSettingsLocation {
  const section = isClaudeSettingsSection(search['section']) ? search['section'] : 'account';
  const folder = search['folder'];

  return typeof folder === 'string' && folder.startsWith('/') && !folder.includes('\0')
    ? { section, folder }
    : { section };
}

/** The address of a location, for a link from another screen or the palette. */
export function claudeSettingsHref(location: ClaudeSettingsLocation): string {
  const search = new URLSearchParams({ section: location.section });

  if (location.folder !== undefined) {
    search.set('folder', location.folder);
  }

  return `/claude-settings?${search.toString()}`;
}
