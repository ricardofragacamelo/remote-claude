/**
 * The search of the workbench: which folder the active tab is, which file of it the editor has
 * active, and what the panel of Claude shows.
 *
 * The folder is in the **search** and not in the path
 * ([06 · D-06](../../../docs/plans/06-workbench/decisions.md#d-06--a-url-do-workbench)): an absolute
 * path in a path segment is a splat full of `/`, and one with `#` or `%` needs double care. The
 * route that reads it is registered with the workbench (plan 06, F2); the contract of the address is
 * fixed here, before it, so every plan that links to a folder spells the same link.
 *
 * `file` is relative to the folder (plan 07, B-40): pasting the link elsewhere opens the folder with
 * that file active. The rest of the editor — its tabs and groups — comes back from what the tab
 * kept, never from the URL (docs/architecture/web/04-state-and-data.md#o-explorer-e-o-editor-dentro-da-aba).
 */
export interface WorkbenchSearch {
  readonly folder?: string;
  readonly file?: string;

  /**
   * The live session the panel of the tab shows (plan 08, D-24) — or `conversation`, a conversation
   * of the history it shows read only. Never both: the panel shows one thing, and a link naming both
   * keeps the session.
   */
  readonly session?: string;
  readonly conversation?: string;
}

/** A search value that names something: text, and not empty — exactly as the link has it. */
function named(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * The folder and the file a link names, exactly as it names them.
 *
 * Nothing is trimmed: a folder whose name ends in a space is a real folder, and "tidying" it would
 * open a different one. Whether the path may be opened is the backend's question, answered against
 * the allowlist — a `file` climbing out of the folder (`../x`) included: the address only asks
 * (plan 07, S-11). A value that is not text — the router parses `?folder=123` as a number — names
 * nothing, and is dropped; a file without a folder is nothing either.
 */
export function readWorkbenchSearch(search: Readonly<Record<string, unknown>>): WorkbenchSearch {
  const folder = named(search['folder']);

  if (folder === undefined) {
    return {};
  }

  const file = named(search['file']);
  const session = named(search['session']);
  const conversation = session === undefined ? named(search['conversation']) : undefined;

  return {
    folder,
    ...(file === undefined ? {} : { file }),
    ...(session === undefined ? {} : { session }),
    ...(conversation === undefined ? {} : { conversation }),
  };
}

/** The workbench's own address, folder and file included — where a sign-in comes back to. */
export function workbenchLocation(search: WorkbenchSearch): string {
  if (search.folder === undefined) {
    return '/workbench';
  }

  const query = new URLSearchParams({ folder: search.folder });

  for (const key of ['file', 'session', 'conversation'] as const) {
    const value = search[key];
    if (value !== undefined) {
      query.set(key, value);
    }
  }

  return `/workbench?${query.toString()}`;
}
