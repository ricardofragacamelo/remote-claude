/**
 * A path relative to the folder of a tab, POSIX — or `null` for one outside it.
 *
 * The editor and the files API name files relative to the folder; Claude names them absolute, and a
 * session of a subfolder writes under the tab's folder too. `/repo-old` is not in `/repo`.
 */
export function relativeTo(folder: string, absolute: string): string | null {
  const root = folder.endsWith('/') ? folder : `${folder}/`;
  return absolute.startsWith(root) ? absolute.slice(root.length) : null;
}
