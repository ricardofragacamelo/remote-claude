/** Public surface of the `files` use cases. */
export { ListTreeUseCase } from './list-tree.use-case';
export type { ListTreeQuery } from './list-tree.use-case';
export { ReadFileUseCase } from './read-file.use-case';
export type { OpenedFile, ReadFileQuery, UnchangedFile } from './read-file.use-case';
export { SaveFileUseCase } from './save-file.use-case';
export type { SaveFileCommand, SavedFile } from './save-file.use-case';
export { CreateEntryUseCase } from './create-entry.use-case';
export type { CreateEntryCommand, CreatedEntry } from './create-entry.use-case';
export { MoveEntryUseCase } from './move-entry.use-case';
export { CopyEntryUseCase } from './copy-entry.use-case';
export { EntryRelocator } from './relocate-entry';
export type { RelocateCommand, RelocatedEntry, Relocation } from './relocate-entry';
export { DeleteEntryUseCase } from './delete-entry.use-case';
export type { DeleteEntryCommand, DeletedEntry } from './delete-entry.use-case';
export { HistoryKeeper } from './history-keeper';
export type {
  BatchKeeping,
  FileKeeping,
  HistoryFailureReporter,
  KeptBatch,
  VersionAtRisk,
} from './history-keeper';
export type { VisibleEntry } from './history-entries';
export { ListHistoryUseCase } from './list-history.use-case';
export type { HistoryPage, ListHistoryQuery } from './list-history.use-case';
export { ReadHistoryContentUseCase } from './read-history-content.use-case';
export type { ReadHistoryContentQuery } from './read-history-content.use-case';
export { RestoreHistoryEntryUseCase } from './restore-history-entry.use-case';
export type { RestoredEntry, RestoreEntryCommand } from './restore-history-entry.use-case';
export type {
  FileHistoryStore,
  HistoryPageQuery,
  HistoryScope,
  KeptContents,
  VersionToKeep,
} from './ports/file-history.port';
export { FILE_HISTORY_STORE } from './ports/file-history.port';
export { FileTrail } from './file-trail';
export { encodedWithin, outcomeOf, writeOver } from './file-writing';
export type { FileWriting, TextToWrite } from './file-writing';
export type { FileFact, TrailFailureReporter } from './file-trail';
export {
  ClaudeWrites,
  CLAUDE_WRITE_MEMORY_ENTRIES,
  CLAUDE_WRITE_MEMORY_MS,
  UserWrites,
} from './claude-writes';
export { RecentWrites, WRITE_MEMORY_ENTRIES, WRITE_MEMORY_MS } from './recent-writes';
export type { RecentWrite } from './recent-writes';
export { ChangeOrigins } from './change-origins';
export type { LabelledChange, UnreadableReporter } from './change-origins';
export { FolderWatches } from './folder-watches';
export type {
  StoppedWatch,
  Watching,
  WatchRequest,
  WatchSettings,
  WatchSink,
  WatchStopReason,
} from './folder-watches';
export type {
  FolderWatcher,
  FolderWatchListener,
  OpenWatch,
  WatcherStop,
} from './ports/folder-watcher.port';
export { FOLDER_WATCHER } from './ports/folder-watcher.port';
export { canonicalEncoding, decodeText, encodeText } from './text-content';
export type { DecodedText } from './text-content';
export type { FileLimits, HistoryLimits, TransferLimits } from './file-limits';
export type { FolderResolver } from './ports/folder-resolver.port';
export { FOLDER_RESOLVER } from './ports/folder-resolver.port';
export type { TextCodec } from './ports/text-codec.port';
export { TEXT_CODEC } from './ports/text-codec.port';
export type {
  ArchiveEntry,
  ArchiveSource,
  ChunkSource,
  CopyCeiling,
  EntryCount,
  EntryInspection,
  FileBytes,
  FolderDisk,
  OutgoingBytes,
  RawFile,
  StagedFile,
  TreeRead,
  WriteGuard,
  WrittenFile,
} from './ports/folder-disk.port';
export { FOLDER_DISK } from './ports/folder-disk.port';
export { VersionCache, VERSION_CACHE_ENTRIES, RACY_CHANGE_MS } from './version-cache';
export { ReadRawUseCase } from './read-raw.use-case';
export type { RawContent, ReadRawQuery } from './read-raw.use-case';
export { DownloadArchiveUseCase } from './download-archive.use-case';
export type { ArchiveContent, ArchiveQuery } from './download-archive.use-case';
export { ReadLimitsUseCase } from './read-limits.use-case';
export type { ClientLimits } from './read-limits.use-case';
export { PreflightUploadUseCase } from './preflight-upload.use-case';
export type { PreflightCommand, PreflightItem } from './preflight-upload.use-case';
export { UploadFilesUseCase } from './upload-files.use-case';
export type {
  ConflictChoice,
  UploadCommand,
  UploadItem,
  UploadOutcome,
  UploadPart,
  UploadParts,
} from './upload-files.use-case';
export type { DeclaredFile } from './upload-plan';
