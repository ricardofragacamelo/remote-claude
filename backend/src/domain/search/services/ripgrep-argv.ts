import { ALWAYS_EXCLUDED_GLOB, DEFAULT_SEARCH_EXCLUDE_GLOBS } from './default-exclusions';

/**
 * The flags present on every ripgrep invocation this backend makes — ADR-016.
 *
 * `--no-require-git`: ripgrep's own default honours `.gitignore` only inside an actual git
 * working directory (measured) — an opened folder that is not one yet, or whose `.git` lives
 * elsewhere, would otherwise see `.gitignore` as an ordinary file. `.ignore` and `.rgignore` are
 * unconditional either way; this makes `.gitignore` behave the same (D-03).
 */
const COMMON_FLAGS: readonly string[] = ['--no-config', '--no-require-git'];

/** What the locator asks ripgrep for a listing of a folder's paths. */
export interface LocateOptions {
  /** `false` includes what the default excludes and the ignore files would otherwise hide. */
  readonly respectDefaultsAndIgnoreFiles: boolean;
  readonly excludeGlobs?: readonly string[];
}

/**
 * The argv of `rg --files`, one element per entry, never a joined string — ADR-016. The folder
 * itself is the process's `cwd`, and no path argument follows the trailing `--`: giving ripgrep
 * an explicit `.` makes it prefix every line with `./` (measured), which is one more thing every
 * caller would have to strip. Every glob still arrives as its own argv element, so one that
 * starts with `-` is never read as an option.
 */
export function locateArgv(options: LocateOptions): string[] {
  const args: string[] = [...COMMON_FLAGS, '--files', '--hidden'];

  if (!options.respectDefaultsAndIgnoreFiles) {
    args.push('--no-ignore');
  }

  args.push(`--glob=!${ALWAYS_EXCLUDED_GLOB}`);

  const excludes = options.respectDefaultsAndIgnoreFiles
    ? [...DEFAULT_SEARCH_EXCLUDE_GLOBS, ...(options.excludeGlobs ?? [])]
    : (options.excludeGlobs ?? []);
  for (const glob of excludes) {
    args.push(`--glob=!${glob}`);
  }

  args.push('--');
  return args;
}
