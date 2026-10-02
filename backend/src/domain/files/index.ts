/** Public surface of the `files` domain. Another domain imports this file, never a deep path. */
export {
  FilePath,
  MAX_SEGMENT_BYTES,
  WINDOWS_RESERVED_NAMES,
  isReservedOnWindows,
} from './value-objects/file-path.value-object';
export { Etag, isWildcard } from './value-objects/etag.value-object';
export {
  BINARY_PROBE_BYTES,
  byteOrderMarkOf,
  endOfLineOf,
  isUtf8,
  looksBinary,
  markOf,
} from './services/text-shape';
export type { EndOfLine, MarkedEncoding } from './services/text-shape';
export { SENSITIVE_FILES, isSensitive, touchesSensitive } from './services/sensitive-files';
export {
  HIDDEN_NAMES,
  TREE_LISTING_LIMIT,
  UNWATCHED_PATHS,
  isUnwatched,
  listTree,
} from './services/tree-listing';
export {
  batchOf,
  coalesceChanges,
  foldChange,
  foldInto,
  relativeTo,
  takesAway,
} from './services/folder-changes';
export type { ChangeBatch, ChangeKind, FolderChange } from './services/folder-changes';
export {
  HISTORY_REASONS,
  authorOf,
  hasContents,
  keptFor,
  storeCutoff,
} from './services/local-history';
export type {
  FolderNotKeptReason,
  HistoryEntry,
  HistoryEntryKind,
  HistoryKept,
  HistoryReason,
  NotKeptReason,
  StoredBlob,
} from './services/local-history';
export { needsHash, originOf } from './services/change-origin';
export type { ChangeOrigin, WriteMark, WriteOutcome, Writer } from './services/change-origin';
export type {
  EntryKind,
  TargetKind,
  TreeChild,
  TreeEntry,
  TreeListing,
  TreeListingInput,
} from './services/tree-listing';
export { InvalidFilePathError } from './errors/invalid-file-path.error';
export type { FilePathRule, FilePathViolation } from './errors/invalid-file-path.error';
export { FileNotFoundError } from './errors/file-not-found.error';
export { FileExistsError } from './errors/file-exists.error';
export { DirectoryNotEmptyError } from './errors/directory-not-empty.error';
export { FileChangedError } from './errors/file-changed.error';
export { PreconditionRequiredError } from './errors/precondition-required.error';
export type { PreconditionReason } from './errors/precondition-required.error';
export { FileTooLargeError } from './errors/file-too-large.error';
export type { SizeMeasure } from './errors/file-too-large.error';
export { FileNotTextError } from './errors/file-not-text.error';
export type { NotTextReason } from './errors/file-not-text.error';
export { FileNotAFileError } from './errors/file-not-a-file.error';
export { FileOperationInvalidError } from './errors/file-operation-invalid.error';
export type { OperationInvalidReason } from './errors/file-operation-invalid.error';
export { FileNotEncodableError } from './errors/file-not-encodable.error';
export { StorageFullError } from './errors/storage-full.error';
export { FileAccessDeniedError } from './errors/file-access-denied.error';
export type { AccessDeniedReason } from './errors/file-access-denied.error';
export {
  FileTrailUnavailableError,
  TRAIL_RETRY_AFTER_SECONDS,
} from './errors/file-trail-unavailable.error';
export { UnknownEncodingError } from './errors/unknown-encoding.error';
export { HistoryEntryNotFoundError } from './errors/history-entry-not-found.error';
export { WatchLimitReachedError } from './errors/watch-limit-reached.error';
export { WATCH_RETRY_AFTER_SECONDS, WatchUnavailableError } from './errors/watch-unavailable.error';
export { rangeOf } from './services/byte-range';
export type { ByteRangeRequest } from './services/byte-range';
export {
  OCTET_STREAM,
  PLAIN_TEXT,
  SVG,
  contentTypeOf,
  isPreviewable,
} from './services/content-type';
export { KEEP_BOTH_ATTEMPTS, keepBothName } from './services/keep-both';
export { archiveNaming, outermost } from './services/archive-naming';
export type { ArchiveNaming } from './services/archive-naming';
export { RangeNotSatisfiableError } from './errors/range-not-satisfiable.error';
export { UploadSizeMismatchError } from './errors/upload-size-mismatch.error';
