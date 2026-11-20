import type { SearchTextOptions } from '@domain/search';
import type { SearchQuery } from '@domain/search';

/** What a caller decides on top of the query itself — never the query's own fields. */
export interface SearchTextOptionsOverrides {
  readonly contextLines: number;
  readonly onlyPaths: readonly string[];
  readonly respectDefaultsAndIgnoreFiles: boolean;
  readonly maxFileBytes: number;
  readonly multilineMaxFileBytes: number;
}

/**
 * The engine's own `SearchTextOptions`, from a validated {@link SearchQuery} — shared by
 * `SearchTextUseCase` (B-10) and `SearchReplaceApplyUseCase` (B-11), which run the same engine
 * call for two different reasons: the first over whatever the query names, the second pinned to
 * one file at a time via `onlyPaths`.
 */
export function searchTextOptionsOf(
  query: SearchQuery,
  overrides: SearchTextOptionsOverrides,
): SearchTextOptions {
  return {
    isRegex: query.isRegex,
    caseSensitive: query.caseSensitive,
    wholeWord: query.wholeWord,
    multiline: query.multiline,
    contextLines: overrides.contextLines,
    include: query.include,
    exclude: query.exclude,
    onlyPaths: overrides.onlyPaths,
    respectDefaultsAndIgnoreFiles: overrides.respectDefaultsAndIgnoreFiles,
    maxFileBytes: overrides.maxFileBytes,
    multilineMaxFileBytes: overrides.multilineMaxFileBytes,
  };
}
