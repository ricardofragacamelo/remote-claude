/**
 * The paths a rule of the canonical grammar names — `file.edit(src/**)`, `search(/srv/app)` — and
 * how one is read against the path of a call (plan 28, B-31).
 *
 * Pure string work and no file system: a rule is decided by what the call says, and a symlink is the
 * workspace fence's business, not the matcher's.
 */

/** Where a path sits: absolute, and relative to the folder of the rule question when inside it. */
export interface LocatedPath {
  /** The path, absolute — `null` when it is relative and the folder is not known. */
  readonly absolute: string | null;

  /** The path relative to the folder — `null` when it is outside it, or the folder is unknown. */
  readonly relative: string | null;
}

/**
 * [path] with its `.` and `..` segments resolved and its repeated slashes folded, or `null` when a
 * `..` climbs out of where it starts — a relative path that leaves its folder, or an absolute one
 * that goes above the root. Nothing such is ever matched: failing closed is a question more.
 */
export function normalizePath(path: string): string | null {
  const absolute = path.startsWith('/');
  const segments: string[] = [];

  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }

    if (segment === '..') {
      if (segments.length === 0) {
        return null;
      }
      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  const joined = segments.join('/');

  return absolute ? `/${joined}` : joined;
}

/**
 * [path] of a call, against [folder] — the folder the session runs in. A relative path is read as
 * relative to the folder, which is where the agent runs it; an absolute one is relative to the
 * folder only when it is inside it.
 */
export function locatePath(path: string, folder: string | null): LocatedPath {
  const normalized = normalizePath(path);
  const root = folder === null || folder === '' ? null : normalizePath(folder);

  if (normalized === null || normalized === '') {
    // A path that climbs out of its folder, or none at all: nothing to match it on.
    return { absolute: null, relative: null };
  }

  if (!normalized.startsWith('/')) {
    return { absolute: root === null ? null : `${root}/${normalized}`, relative: normalized };
  }

  return {
    absolute: normalized,
    relative:
      root !== null && normalized.startsWith(`${root}/`) ? normalized.slice(root.length + 1) : null,
  };
}

/** Whether [pattern] has glob characters — what makes a path matcher more than one exact path. */
export function hasGlob(pattern: string): boolean {
  return pattern.includes('*');
}

/** What a regular expression would read as syntax, escaped — everything but the `*` of a glob. */
const REGEX_SYNTAX = /[.+?^${}()|[\]\\]/g;

/**
 * Whether [glob] covers [path]: `**` is any run of characters including `/`, `*` any run without
 * one, and every other character is itself. Anchored at both ends — `src/*` does not cover
 * `src/a/b`, and `src` does not cover `src/a`.
 */
export function globCovers(glob: string, path: string): boolean {
  const source = glob
    .split('**')
    .map((part) => part.replace(REGEX_SYNTAX, '\\$&').replaceAll('*', '[^/]*'))
    .join('.*');

  return new RegExp(`^${source}$`, 's').test(path);
}

/**
 * Whether a path matcher of a rule covers the [path] of a call, in [folder].
 *
 * A matcher starting with `/` is absolute and is read against the absolute path; any other is
 * relative to the folder, and a path outside the folder is never covered by one. A matcher with a
 * `..` is read as it normalises; one that climbs out of its root covers nothing.
 */
export function pathMatcherCovers(matcher: string, path: string, folder: string | null): boolean {
  const located = locatePath(path, folder);
  const absolute = matcher.startsWith('/');
  const target = absolute ? located.absolute : located.relative;
  const normalizedMatcher = hasGlob(matcher) ? matcher : normalizePath(matcher);

  if (target === null || normalizedMatcher === null) {
    return false;
  }

  return hasGlob(normalizedMatcher)
    ? globCovers(normalizedMatcher, target)
    : normalizedMatcher === target;
}
