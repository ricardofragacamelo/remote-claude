/** Public surface of the `search` use cases. */
export { PROCESS_RUNNER, ProcessAbortedError } from './ports/process-runner.port';
export type {
  ProcessCommand,
  ProcessOutcome,
  ProcessRun,
  ProcessRunner,
} from './ports/process-runner.port';
export { SEARCH_FOLDER_RESOLVER } from './ports/folder-resolver.port';
export type { FolderResolver } from './ports/folder-resolver.port';
export { RIPGREP_BINARY, SEARCH_ENGINE } from './ports/search-engine.port';
export type {
  EngineContextLine,
  EngineFileMatches,
  EngineLineMatch,
  EngineSubmatch,
  ListFilesOutcome,
  ListFilesRun,
  ListLocateOutcome,
  ProcessBudget,
  RipgrepBinary,
  SearchEngine,
  SearchTextOutcome,
  SearchTextRun,
} from './ports/search-engine.port';
export { LocateCache } from './locate-cache';
export type { LocateCacheEntry, LocateTruncation } from './locate-cache';
export { FindPathsUseCase, MAX_PREFER_ITEMS, PREFER_SCORE_BONUS } from './find-paths.use-case';
export type {
  LocateEntry,
  LocateEntryKind,
  LocateInput,
  LocateResult,
} from './find-paths.use-case';
export { SearchConcurrencyGate } from './search-concurrency-gate';
export { SearchTextUseCase } from './search-text.use-case';
export type {
  SearchContextLineResult,
  SearchFileResult,
  SearchMatchResult,
  SearchTextInput,
  SearchTextResult,
  SearchTruncation,
} from './search-text.use-case';
export { SearchReplacePreviewUseCase } from './search-replace-preview.use-case';
export type {
  SearchReplacePreviewFileResult,
  SearchReplacePreviewInput,
  SearchReplacePreviewMatchResult,
  SearchReplacePreviewResult,
} from './search-replace-preview.use-case';
export { SearchReplaceApplyUseCase } from './search-replace-apply.use-case';
export type {
  SearchReplaceApplyFileRequest,
  SearchReplaceApplyInput,
  SearchReplaceApplyReport,
  SearchReplaceApplySkipReason,
} from './search-replace-apply.use-case';
