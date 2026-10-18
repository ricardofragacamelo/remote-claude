/**
 * Where the screen of an engine's settings is: which engine, which of its sections, and the folder
 * whose overrides and project it shows. The engine is a segment of the address
 * (`/settings/agents/$engine`); the section and the folder are in the search, so a link reproduces
 * the screen (docs/architecture/web/04-state-and-data.md#a-url-é-estado).
 */
export interface AgentSettingsLocation {
  readonly section: string;

  /** An absolute folder, or none — the user's own defaults, with no folder in view. */
  readonly folder?: string;
}

/** What the search of the address carries, before it is checked against a section nobody knows. */
export interface AgentSettingsSearch {
  readonly section: string;
  readonly folder?: string;
}

/**
 * The search of the address, read loosely: a folder that is not absolute is dropped, and a missing
 * or malformed section is kept as given — whether it names a section this engine has is for the
 * route to decide, with the engine in hand (`beforeLoad`, mirroring `/settings/$section`).
 */
export function readAgentSettingsSearch(
  search: Readonly<Record<string, unknown>>,
): AgentSettingsSearch {
  const rawSection = search['section'];
  const section = typeof rawSection === 'string' ? rawSection : '';
  const folder = search['folder'];

  return typeof folder === 'string' && folder.startsWith('/') && !folder.includes('\0')
    ? { section, folder }
    : { section };
}

/**
 * The address of a location, for a link from another screen, the palette or the navigation.
 *
 * `section` left out links to the engine's screen alone — the route sends it to the first section
 * registered for that engine, the same way `/settings` alone does for the app's own.
 */
export function agentSettingsHref(location: {
  readonly engine: string;
  readonly section?: string;
  readonly folder?: string;
}): string {
  const search = new URLSearchParams(
    location.section === undefined ? {} : { section: location.section },
  );

  if (location.folder !== undefined) {
    search.set('folder', location.folder);
  }

  const query = search.toString();
  return `/settings/agents/${location.engine}${query === '' ? '' : `?${query}`}`;
}
