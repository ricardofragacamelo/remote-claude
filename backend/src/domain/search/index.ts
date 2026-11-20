/** Public surface of the `search` domain. Another domain imports this file, never a deep path. */
export { ALLOWED_PROCESS_ENV_KEYS, allowedProcessEnv } from './services/process-environment';
export { containedRelativePath } from './services/path-containment';
export { preserveCase } from './services/preserve-case';
export { hasUnsupportedGroupReference, resolvedReplacementOf } from './services/replacement-text';
export { appliedContentOf, appliedLineOf } from './services/applied-content';
export type { AppliedLineMatch } from './services/applied-content';
export { fuzzyScore } from './services/fuzzy-score';
export type { FuzzyMatch } from './services/fuzzy-score';
export { hasUnsupportedRegexFeature } from './services/regex-support';
export { ALWAYS_EXCLUDED_GLOB, DEFAULT_SEARCH_EXCLUDE_GLOBS } from './services/default-exclusions';
export { locateArgv } from './services/ripgrep-argv';
export type { LocateOptions } from './services/ripgrep-argv';
export { searchTextArgv } from './services/search-text-argv';
export type { SearchTextOptions } from './services/search-text-argv';
export { utf16ColumnOf } from './services/byte-utf16-column';
export { matchPreviewOf } from './services/match-preview';
export type { MatchPreview } from './services/match-preview';
export {
  MAX_GLOB_ITEMS,
  MAX_PATTERN_LENGTH,
  SearchQuery,
} from './value-objects/search-query.value-object';
export type { SearchQueryInput } from './value-objects/search-query.value-object';
export { SearchPatternInvalidError } from './errors/search-pattern-invalid.error';
export type { SearchPatternInvalidReason } from './errors/search-pattern-invalid.error';
export { SearchEngineFailedError } from './errors/search-engine-failed.error';
export { SearchRateLimitedError } from './errors/search-rate-limited.error';
export { SearchReplaceApplyFailedError } from './errors/search-replace-apply-failed.error';
export { SearchReplaceTooManyFilesError } from './errors/search-replace-too-many-files.error';
export { GlobOutsideFolderError } from './errors/glob-outside-folder.error';
export { PathOutsideFolderError } from './errors/path-outside-folder.error';
export { SearchQueryInvalidError } from './errors/search-query-invalid.error';
export type { SearchQueryRule, SearchQueryViolation } from './errors/search-query-invalid.error';
export { LocateInputInvalidError } from './errors/locate-input-invalid.error';
export type { LocateInputRule, LocateInputViolation } from './errors/locate-input-invalid.error';
