import { ALWAYS_EXCLUDED_GLOB, DEFAULT_SEARCH_EXCLUDE_GLOBS } from './default-exclusions';

/** The flags present on every search invocation — ADR-016, the same as the locator's. */
const COMMON_FLAGS: readonly string[] = ['--no-config', '--no-require-git', '--hidden'];

export interface SearchTextOptions {
  readonly isRegex: boolean;
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  readonly multiline: boolean;
  readonly contextLines: number;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  readonly onlyPaths?: readonly string[];
  readonly respectDefaultsAndIgnoreFiles: boolean;
  readonly maxFileBytes: number;
  readonly multilineMaxFileBytes: number;
}

/** Bytes a compiled pattern — or the DFA it builds — may grow to, so a pattern never pins a CPU. */
const REGEX_SIZE_LIMIT = '10M';

/**
 * The argv of `rg --json`, one element per entry, never a joined string — ADR-016. `--max-columns`
 * is deliberately absent: measured, it has **no effect** on `--json` output, which always carries
 * the whole line — cropping a huge one to a preview is this backend's own job (B-10, S-66), not
 * an engine flag's. `--replace` is absent for the same reason, measured the same way: ripgrep's
 * own `--help` says plainly that `-r/--replace` "have no effect when --json is set" — the
 * replace flows (B-11) compute the substituted text themselves, from the same match offsets a
 * plain search already gives (`replacement-text.ts`), never by asking the engine to do it.
 */
export function searchTextArgv(pattern: string, options: SearchTextOptions): string[] {
  return [
    ...COMMON_FLAGS,
    '--json',
    ...matchFlagsOf(options),
    ...sizeFlagsOf(options),
    ...globFlagsOf(options),
    `--regexp=${pattern}`,
    '--',
    ...pathArgumentsOf(options.onlyPaths),
  ];
}

/**
 * The path arguments after `--` — never empty. Measured: with no path argument at all, ripgrep
 * decides whether to search the folder or to read its own stdin by whether stdin is a pipe, which
 * a spawned child's always is (even closed and empty) — unlike a terminal or `/dev/null`. An
 * explicit `.` rules that out the same way naming the real paths does; the `./` prefix it then
 * puts on every result is stripped once, centrally, by the JSON mapper.
 */
function pathArgumentsOf(onlyPaths: readonly string[] | undefined): readonly string[] {
  return onlyPaths !== undefined && onlyPaths.length > 0 ? onlyPaths : ['.'];
}

/** Every flag that changes what counts as a match — case, word boundary, literal, multiline. */
function matchFlagsOf(options: SearchTextOptions): string[] {
  const flags: string[] = [options.caseSensitive ? '--case-sensitive' : '--ignore-case'];

  if (options.wholeWord) flags.push('--word-regexp');
  if (!options.isRegex) flags.push('--fixed-strings');
  if (options.multiline) flags.push('--multiline');
  if (options.contextLines > 0) flags.push(`--context=${String(options.contextLines)}`);

  return flags;
}

/** The ceilings that keep one file or one pattern from pinning the machine — ADR-016. */
function sizeFlagsOf(options: SearchTextOptions): string[] {
  const maxFileBytes = options.multiline ? options.multilineMaxFileBytes : options.maxFileBytes;

  return [
    `--max-filesize=${String(maxFileBytes)}`,
    `--regex-size-limit=${REGEX_SIZE_LIMIT}`,
    `--dfa-size-limit=${REGEX_SIZE_LIMIT}`,
  ];
}

/** `.git` is always out; the rest follows the one D-03 toggle, plus whatever the query added. */
function globFlagsOf(options: SearchTextOptions): string[] {
  const excludes = options.respectDefaultsAndIgnoreFiles
    ? [...DEFAULT_SEARCH_EXCLUDE_GLOBS, ...(options.exclude ?? [])]
    : (options.exclude ?? []);

  return [
    ...(options.respectDefaultsAndIgnoreFiles ? [] : ['--no-ignore']),
    `--glob=!${ALWAYS_EXCLUDED_GLOB}`,
    ...excludes.map((glob) => `--glob=!${glob}`),
    ...(options.include ?? []).map((glob) => `--glob=${glob}`),
  ];
}
