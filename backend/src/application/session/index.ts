/** Public surface of the `session` use cases. */
export { AttachSessionUseCase } from './attach-session.use-case';
export type { AttachedSession, SessionConversations } from './attach-session.use-case';
export { StartSessionUseCase } from './start-session.use-case';
export { ListLiveSessionsUseCase } from './list-live-sessions.use-case';
export type { LiveSessionListing } from './list-live-sessions.use-case';
export type { FolderLocator } from './ports/folder-locator.port';
export { FOLDER_LOCATOR } from './ports/folder-locator.port';
export type { PendingPermissions } from './ports/pending-permissions.port';
export { PENDING_PERMISSIONS } from './ports/pending-permissions.port';
export type {
  SessionDefaults,
  SessionProvenance,
  SessionResumption,
  StartedSession,
} from './start-session.use-case';
export type { StartSessionCommand } from './commands/start-session.command';
export { CommandCatalog, MAX_CACHED_LISTS, ModelCatalog } from './command-catalog';
export { InstallationCache } from './installation-cache';
export { InspectSessionUseCase } from './session-insight.use-cases';
export type { SessionModels } from './session-insight.use-cases';
export {
  CancelQueuedPromptUseCase,
  CloseSessionUseCase,
  InterruptSessionUseCase,
  ListSessionCommandsUseCase,
  PromptSessionUseCase,
  SetSessionModelUseCase,
  SetSessionPermissionModeUseCase,
} from './drive-session.use-cases';
export type { PromptQueueing, SessionCommandMenu } from './drive-session.use-cases';
export {
  ListUndoPointsUseCase,
  MAX_UNDO_POINTS,
  RewindFilesUseCase,
  UndoPlanner,
} from './rewind-files.use-cases';
export type {
  FilePreview,
  RewindFilesCommand,
  RewindOutcome,
  UndoPointPreview,
} from './rewind-files.use-cases';
export type {
  FileContent,
  RestoredFile,
  UndoDisk,
  UndoJournal,
  UndoReach,
  WrittenFile,
} from './ports/undo.ports';
export {
  ABSENT_REVISION,
  ListSessionChangesUseCase,
  ReadSessionChangeUseCase,
  RejectChangeUseCase,
  RestoreChangeUseCase,
  ShowToolDiffUseCase,
} from './session-changes.use-cases';
export type {
  ChangeLimits,
  ChangeSide,
  ChangeStores,
  ChangeWriting,
  RejectChangeCommand,
  RestoreChangeCommand,
  SessionChangeFile,
  SessionChanges,
  SessionChangeSummary,
} from './session-changes.use-cases';
export {
  MAX_REMEMBERED_INPUT_CHARS,
  MAX_REMEMBERED_TOOLS,
  SessionChangeMemory,
} from './session-change-memory';
export type { RecordedTool, Rejection, RememberedInvocation } from './session-change-memory';
export { UNDO_DISK, UNDO_JOURNAL } from './ports/undo.ports';
export type { JournalScope } from './ports/session-file-journal.port';
export { SessionRegistry } from './session-registry';
export { SessionEnder } from './session-ender';
export { ReapIdleSessionsUseCase } from './reap-idle-sessions.use-case';
export { ShutdownSessionsUseCase } from './shutdown-sessions.use-case';
export { observedStatus } from './session-status';
export type { LiveSession } from './session-registry';
export type {
  ClaudeSessionHandle,
  ClaudeSessionPort,
  ClaudeSessionStart,
  SessionConversation,
  SessionEvent,
} from './ports/claude-session.port';
export type {
  ResumableConversation,
  ResumableConversationSource,
} from './ports/resumable-conversation.source';
export { RESUMABLE_CONVERSATION_SOURCE } from './ports/resumable-conversation.source';
export { CLAUDE_SESSION_PORT } from './ports/claude-session.port';
export type { SessionBroadcaster } from './ports/session-broadcaster.port';
export type { SessionAccess, SessionOwnership } from './ports/session-ownership.port';
export { SESSION_BROADCASTER } from './ports/session-broadcaster.port';
export type {
  PermissionQuestion,
  PermissionVerdict,
  SessionPermissionGate,
} from './ports/permission-gate.port';
export { SESSION_PERMISSION_GATE } from './ports/permission-gate.port';
export type { SessionFileJournal } from './ports/session-file-journal.port';
export { SESSION_FILE_JOURNAL } from './ports/session-file-journal.port';
export type { SessionFileEvents } from './ports/session-file-events.port';
export { SESSION_FILE_EVENTS } from './ports/session-file-events.port';
export type { ToolInvocation, ToolInvocationRecorder } from './ports/tool-invocation.port';
export { TOOL_INVOCATION_RECORDER } from './ports/tool-invocation.port';
export type { WorkspaceResolver } from './ports/workspace-resolver.port';
export { WORKSPACE_RESOLVER } from './ports/workspace-resolver.port';
export type { SessionOrigin, SessionOriginRepository } from './ports/session-origin.repository';
export {
  CLAUDE_SESSION_ID_GENERATOR,
  SESSION_ORIGIN_REPOSITORY,
} from './ports/session-origin.repository';
