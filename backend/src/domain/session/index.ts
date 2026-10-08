/** Public surface of the `session` domain. Another domain imports this file, never a deep path. */
export { Session } from './entities/session.entity';
export type { SessionClient, SessionCloseReason, SessionOpening } from './entities/session.entity';
export { liveSessionsIn } from './services/live-session-listing';
export { SessionFileState } from './entities/session-file-state.entity';
export type { SessionFileStateSnapshot } from './entities/session-file-state.entity';
export { TurnFileCheckpoint } from './entities/turn-file-checkpoint.entity';
export type {
  FilePresence,
  Restorability,
  TurnFileCheckpointSnapshot,
} from './entities/turn-file-checkpoint.entity';
export { SessionId } from './value-objects/session-id.value-object';
export {
  PERMISSION_MODES,
  isPermissionMode,
  sdkPermissionMode,
} from './value-objects/permission-mode.value-object';
export type {
  PermissionMode,
  SdkPermissionMode,
} from './value-objects/permission-mode.value-object';
export {
  ALLOWED_TRANSITIONS,
  SESSION_STATUSES,
  canTransition,
} from './value-objects/session-status.value-object';
export type { SessionStatus } from './value-objects/session-status.value-object';
export { statusFor } from './services/session-status.projection';
export { resumeStrategyFor } from './services/resume-strategy';
export { sessionCapacity } from './services/session-capacity';
export type { CapacityInputs } from './services/session-capacity';
export type { ResumeCaller, ResumeCandidate, ResumeStrategy } from './services/resume-strategy';
export {
  SUGGESTED_COMMANDS,
  SYSTEM_SKILLS_PLUGIN,
  USER_SKILLS_PLUGIN,
  commandIn,
  isHidden,
  menuOf,
  offers,
  originOf,
} from './services/slash-commands';
export type { CommandOrigin, MenuCommand, SlashCommand } from './services/slash-commands';
export {
  MENTION_GUARD,
  composePrompt,
  guardMentions,
  referenceLine,
  textBlock,
} from './services/prompt-context';
export type {
  ContextFact,
  PromptExtras,
  PromptImage,
  PromptReference,
  PromptText,
} from './services/prompt-context';
export { ATTACHMENT_IMAGE_TYPES, attachmentKindOf } from './services/attachment-kind';
export type { AttachmentKind } from './services/attachment-kind';
export { AttachmentTooLargeError } from './errors/attachment-too-large.error';
export { ReferenceKindMismatchError } from './errors/reference-kind-mismatch.error';
export {
  latestBaselines,
  planFor,
  undoPointNamed,
  undoPointsOf,
  verdictFor,
} from './services/rewind-plan';
export type {
  FileObservation,
  FileVerdict,
  PreservationReason,
  UndoPoint,
} from './services/rewind-plan';
export {
  DIFF_CONTEXT_LINES,
  MAX_EDIT_DISTANCE,
  hunksBetween,
  lineCounts,
  lineTokens,
  snippetHunk,
  withHunkReverted,
} from './services/line-diff';
export type { DiffHunk, DiffLine } from './services/line-diff';
export {
  DIFFABLE_TOOLS,
  diffablePathOf,
  fileChangeOf,
  firstCheckpoints,
  isDiffableTool,
  toolDiffOf,
} from './services/session-diff';
export { isAsLeft } from './services/file-state';
export type {
  ChangeKind,
  DiffableTool,
  DiffAfter,
  DiffBefore,
  DiskText,
  FileChange,
  SnapshotText,
  ToolDiff,
  ToolDiffFacts,
} from './services/session-diff';
export { AttachmentNotFoundError } from './errors/attachment-not-found.error';
export { AttachmentTypeUnsupportedError } from './errors/attachment-type-unsupported.error';
export { DiffNotApplicableError } from './errors/diff-not-applicable.error';
export { EffortUnsupportedError } from './errors/effort-unsupported.error';
export { ForkPointUnknownError } from './errors/fork-point-unknown.error';
export { QueuedPromptNotFoundError } from './errors/queued-prompt-not-found.error';
export { QueuedPromptStartedError } from './errors/queued-prompt-started.error';
export { SessionChangeStaleError } from './errors/session-change-stale.error';
export { SessionChangeNotFoundError } from './errors/session-change-not-found.error';
export { RewindPathUnknownError } from './errors/rewind-path-unknown.error';
export { SessionForkRejectedError } from './errors/session-fork-rejected.error';
export { ToolUseNotFoundError } from './errors/tool-use-not-found.error';
export { ClaudeTimeoutError } from './errors/claude-timeout.error';
export { ClaudeUnavailableError } from './errors/claude-unavailable.error';
export { InvalidSessionIdError } from './errors/invalid-session-id.error';
export { InvalidSessionTransitionError } from './errors/invalid-session-transition.error';
export { SessionForbiddenError } from './errors/session-forbidden.error';
export { SessionClosedError } from './errors/session-closed.error';
export { SessionLimitReachedError } from './errors/session-limit-reached.error';
export { RewindIncompleteError } from './errors/rewind-incomplete.error';
export { RewindTargetUnknownError } from './errors/rewind-target-unknown.error';
export { SessionLockedError } from './errors/session-locked.error';
export { SessionNotFoundError } from './errors/session-not-found.error';
export { UnknownCommandError } from './errors/unknown-command.error';
export {
  PromptQueue,
  previewOf,
  QUEUE_PREVIEW_LENGTH,
  REMEMBERED_DEPARTURES,
} from './entities/prompt-queue.entity';
export type { Cancellation, QueuedPrompt, Submission } from './entities/prompt-queue.entity';
export {
  categoryIdOf,
  EFFORT_LEVELS,
  forkPointOf,
  refuseUnsupportedEffort,
} from './services/installation';
export type {
  ChainEntry,
  ContextCategory,
  ContextKind,
  ContextUse,
  EffortLevel,
  ForkPoint,
  InstallationModel,
  McpServer,
  McpStatus,
} from './services/installation';
