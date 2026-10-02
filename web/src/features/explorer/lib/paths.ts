/**
 * Paths relative to the open folder, POSIX, `''` for the folder itself — the only paths the explorer
 * speaks (07 · D-11). Pure: no disk, no server.
 */

/** The folder an entry is in: `src` for `src/a.ts`, `''` for `a.ts`. */
export function parentOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

/** The last segment: `a.ts` for `src/a.ts`. */
export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** `name` inside `folder` — the folder itself when it is `''`. */
export function childOf(folder: string, name: string): string {
  return folder === '' ? name : `${folder}/${name}`;
}

/** Whether `path` is `ancestor` or anything under it. `''` contains everything. */
export function isWithin(path: string, ancestor: string): boolean {
  return ancestor === '' || path === ancestor || path.startsWith(`${ancestor}/`);
}

/** The folders above an entry, outermost first, the folder itself left out: `a`, `a/b` for `a/b/c`. */
export function ancestorsOf(path: string): readonly string[] {
  const segments = path.split('/').slice(0, -1);
  return segments.map((_, index) => segments.slice(0, index + 1).join('/'));
}

/** `path` moved from under `from` to under `to` — what a rename does to the entries inside it. */
export function rebased(path: string, from: string, to: string): string {
  return path === from ? to : `${to}${path.slice(from.length)}`;
}

/** The absolute path of an entry of `folder` — what "Copy path" copies. */
export function absoluteOf(folder: string, path: string): string {
  const base = folder.endsWith('/') && folder !== '/' ? folder.slice(0, -1) : folder;

  if (path === '') {
    return base;
  }

  return base === '/' ? `/${path}` : `${base}/${path}`;
}

/**
 * The outermost of a set of paths: an entry whose folder is in the set goes with it, and acting on
 * it again would act twice.
 */
export function outermost(paths: readonly string[]): readonly string[] {
  return paths.filter((path) => !paths.some((other) => other !== path && isWithin(path, other)));
}
