import { GlobOutsideFolderError } from '../errors/glob-outside-folder.error';
import { PathOutsideFolderError } from '../errors/path-outside-folder.error';
import { SearchPatternInvalidError } from '../errors/search-pattern-invalid.error';
import { SearchQueryInvalidError } from '../errors/search-query-invalid.error';
import type { SearchQueryViolation } from '../errors/search-query-invalid.error';
import { containedRelativePath } from '../services/path-containment';
import { hasUnsupportedRegexFeature } from '../services/regex-support';
import { hasUnsupportedGroupReference } from '../services/replacement-text';

/** The longest a pattern may be — provisional, like every ceiling of plan 11, D-06. */
export const MAX_PATTERN_LENGTH = 1_000;

/** The most `include` and `exclude` globs a query may carry, together. */
export const MAX_GLOB_ITEMS = 64;

export interface SearchQueryInput {
  readonly pattern: string;
  readonly isRegex: boolean;
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  /** Only these files are searched — the editors already open (plan 11, B-10). */
  readonly onlyPaths?: readonly string[];
  /** Present only for a replace preview or apply (B-11) — absent, this is a plain search. */
  readonly replacement?: string;
}

/**
 * A text search or a replace preview, validated down to what the engine is actually given.
 *
 * Nothing here runs a process: the rule is pure, exactly like {@link FilePath} is, so a request
 * that was never going to be allowed costs nothing before it is refused.
 */
export class SearchQuery {
  private constructor(
    readonly pattern: string,
    readonly isRegex: boolean,
    readonly caseSensitive: boolean,
    readonly wholeWord: boolean,
    /** Switched on automatically the moment the pattern carries a newline, like the VS Code UI. */
    readonly multiline: boolean,
    readonly include: readonly string[],
    readonly exclude: readonly string[],
    readonly onlyPaths: readonly string[],
    /** `undefined` for a plain search — present only for a replace preview or apply (B-11). */
    readonly replacement: string | undefined,
  ) {}

  /**
   * @throws {SearchQueryInvalidError} one or more fields are not well-formed, all of them at once
   * @throws {SearchPatternInvalidError} `isRegex` and the pattern needs a feature the engine
   *   never supports — lookaround or a backreference (S-28); a syntax error the engine's own
   *   grammar rejects for any other reason is reported by the engine itself, not here. The same
   *   error, `'unsupported'`, for a `replacement` that references a numbered or named capture
   *   group this backend cannot resolve on its own (S-82) — `$0` and `$$` are always fine
   * @throws {GlobOutsideFolderError} an `include` or `exclude` glob reaches outside the folder
   * @throws {PathOutsideFolderError} an entry of `onlyPaths` reaches outside the folder
   */
  static create(input: SearchQueryInput): SearchQuery {
    const include = input.include ?? [];
    const exclude = input.exclude ?? [];
    const onlyPaths = input.onlyPaths ?? [];

    const violations = formatViolations(input.pattern, include, exclude);
    if (violations.length > 0) {
      throw new SearchQueryInvalidError(violations);
    }

    if (input.isRegex && hasUnsupportedRegexFeature(input.pattern)) {
      throw new SearchPatternInvalidError('unsupported');
    }

    if (
      input.replacement !== undefined &&
      hasUnsupportedGroupReference(input.replacement, input.isRegex)
    ) {
      throw new SearchPatternInvalidError('unsupported');
    }

    requireGlobsInsideFolder('include', include);
    requireGlobsInsideFolder('exclude', exclude);
    requirePathsInsideFolder(onlyPaths);

    return new SearchQuery(
      input.pattern,
      input.isRegex,
      input.caseSensitive,
      input.wholeWord,
      input.pattern.includes('\n'),
      include,
      exclude,
      onlyPaths,
      input.replacement,
    );
  }
}

function formatViolations(
  pattern: string,
  include: readonly string[],
  exclude: readonly string[],
): SearchQueryViolation[] {
  const violations: SearchQueryViolation[] = [];

  if (pattern.length === 0) {
    violations.push({ field: 'pattern', rule: 'patternRequired' });
  } else if (pattern.length > MAX_PATTERN_LENGTH) {
    violations.push({ field: 'pattern', rule: 'patternTooLong' });
  }

  if (include.length + exclude.length > MAX_GLOB_ITEMS) {
    violations.push({ field: 'include/exclude', rule: 'tooManyGlobs' });
  }

  return violations;
}

function requireGlobsInsideFolder(field: 'include' | 'exclude', globs: readonly string[]): void {
  for (const glob of globs) {
    if (containedRelativePath(glob) === null) {
      throw new GlobOutsideFolderError(field, glob);
    }
  }
}

function requirePathsInsideFolder(paths: readonly string[]): void {
  for (const path of paths) {
    if (containedRelativePath(path) === null) {
      throw new PathOutsideFolderError(path);
    }
  }
}
