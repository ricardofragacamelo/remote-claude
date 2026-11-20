/**
 * Public surface of the `search` feature.
 *
 * Importing it puts Quick Open in the places of the shell it fills (`./register`), at load — the
 * palette's own empty-prefix mode, and the `Ctrl/Cmd+P` that opens it (plan 11, B-14).
 */
import './register';

export { useFileFinder } from './hooks/useFileFinder';
export type { FileFinder } from './hooks/useFileFinder';
export { useTextSearch } from './hooks/useTextSearch';
export type { TextSearch } from './hooks/useTextSearch';
export { useReplacePreview } from './hooks/useReplacePreview';
export type { ReplacePreview } from './hooks/useReplacePreview';
export { useApplyReplace } from './hooks/useApplyReplace';
export type { ApplyReplace, ApplyReplaceRequest } from './hooks/useApplyReplace';
export { searchKeys } from './hooks/search-keys';
export { searchInFolder } from './store/search-view.store';
export { QuickOpenFolder } from './components/QuickOpenFolder';
export { SearchLocation } from './components/SearchLocation';
export type { SearchLocationProps } from './components/SearchLocation';
export type { SearchLocationValue } from './hooks/useSearchLocation';
export type {
  LocateEntry,
  LocateEntryKind,
  LocateQuery,
  LocateResult,
  ReplaceApplyFileRequest,
  ReplaceApplyReport,
  ReplaceApplySkipReason,
  ReplacePreviewFileResult,
  ReplacePreviewMatch,
  ReplacePreviewState,
  ReplaceQuery,
  SearchContextLine,
  SearchFileResult,
  SearchMatch,
  SearchQuery,
  SearchTruncation,
  TextSearchState,
} from './types/search';
