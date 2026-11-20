import { posix } from 'node:path';

/**
 * Normalises a relative POSIX path or glob, or answers that it reaches outside the open folder.
 *
 * Used both ways: on the way in, an `include`/`exclude` glob, a path of `onlyPaths`, or a file of
 * a replace request that resolves outside the folder is bad **input** (`INVALID_INPUT`, S-32,
 * S-35) — the folder itself was never in question, one value named inside the request was. On the
 * way out, a result path the engine returned is contained the same way and silently dropped if it
 * does not pass (S-42) — defence in depth, because ripgrep never follows a symlink and never
 * walks above the folder it was given, so this should never fire; the rule does not depend on
 * that holding.
 *
 * A glob's wildcards (`*`, `?`, `[...]`) are untouched — `posix.normalize` only collapses `.` and
 * `..` segments and doubled slashes, nothing a wildcard character triggers.
 *
 * @returns the normalised, relative path (`''` for the folder itself), or `null` for anything
 *   absolute, carrying `~`, or that climbs above the folder
 */
export function containedRelativePath(raw: string): string | null {
  if (raw.startsWith('/') || raw.includes('~')) {
    return null;
  }

  const normalised = posix.normalize(raw === '' ? '.' : raw).replace(/\/+$/, '');
  const relative = normalised === '.' ? '' : normalised;

  return relative === '..' || relative.startsWith('../') ? null : relative;
}
