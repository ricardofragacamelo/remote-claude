/** Paths of a folder, as the files API takes them: relative, POSIX, `''` for the folder itself. */

/** The last segment of a path — what a tab calls the file. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** The directory a path is in — `''` for one at the top of the folder. */
export function parentOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at === -1 ? '' : path.slice(0, at);
}

/**
 * Where `path` is after `from` moved to `to`: the entry itself, or anything under it when it is a
 * directory — and `null` when the move did not touch it.
 */
export function retarget(path: string, from: string, to: string): string | null {
  if (path === from) {
    return to;
  }

  return path.startsWith(`${from}/`) ? `${to}${path.slice(from.length)}` : null;
}

/** One step of the way to a file, from the top of the folder (S-220). */
export interface Crumb {
  readonly name: string;

  /** The directory this step is, relative to the folder — `''` for the folder itself. */
  readonly directory: string;
}

/**
 * The directories on the way to a file, each with the directory it is in — the trail above the
 * editor. The folder itself is the first step.
 */
export function crumbsOf(path: string): readonly Crumb[] {
  const segments = path.split('/').filter((segment) => segment !== '');

  return segments.map((name, index) => ({
    name,
    directory: segments.slice(0, index).join('/'),
  }));
}

/** A path joined under a directory of the folder. */
export function joinPath(directory: string, name: string): string {
  return directory === '' ? name : `${directory}/${name}`;
}
