/**
 * The search of the workbench: which folder the active tab is.
 *
 * The folder is in the **search** and not in the path
 * ([06 · D-06](../../../docs/plans/06-workbench/decisions.md#d-06--a-url-do-workbench)): an absolute
 * path in a path segment is a splat full of `/`, and one with `#` or `%` needs double care. The
 * route that reads it is registered with the workbench (plan 06, F2); the contract of the address is
 * fixed here, before it, so every plan that links to a folder spells the same link.
 */
export interface WorkbenchSearch {
  readonly folder?: string;
}

/**
 * The folder a link names, exactly as it names it.
 *
 * Nothing is trimmed: a folder whose name ends in a space is a real folder, and "tidying" it would
 * open a different one. Whether the path may be opened is the backend's question, answered against
 * the allowlist; the link only has to name something. A value that is not text — the router parses
 * `?folder=123` as a number — names nothing, and is dropped.
 */
export function readWorkbenchSearch(search: Readonly<Record<string, unknown>>): WorkbenchSearch {
  const folder = search['folder'];

  return typeof folder === 'string' && folder !== '' ? { folder } : {};
}

/** The workbench's own address, folder included — where a sign-in comes back to. */
export function workbenchLocation(search: WorkbenchSearch): string {
  return search.folder === undefined
    ? '/workbench'
    : `/workbench?${new URLSearchParams({ folder: search.folder }).toString()}`;
}
