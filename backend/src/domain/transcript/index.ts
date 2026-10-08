/** Public surface of the `transcript` domain. Another domain imports this file, never a deep path. */
export { ClaudeSessionId } from './value-objects/claude-session-id.value-object';
export type {
  TranscriptEvent,
  TranscriptMessage,
} from './value-objects/transcript-message.value-object';
export type {
  TranscriptOrigin,
  TranscriptSession,
  VisibleTranscriptSession,
} from './entities/transcript-session.entity';
export { transcriptOriginFor } from './services/transcript-visibility';
export { activityOf } from './services/transcript-activity';
export type {
  ActivityContext,
  ConversationActivity,
  TranscriptActivity,
} from './services/transcript-activity';
export type { TranscriptAudience } from './services/transcript-visibility';
export { pageFromTail, pageOfSessions } from './services/transcript-pages';
export { transcriptTail } from './services/transcript-tail';
export type { TranscriptTail } from './services/transcript-tail';
export { inferWorking } from './services/infer-working';
export { clipOutput } from './services/tool-output';
export type { ToolOutput } from './services/tool-output';
export type { Page, SessionListCursor } from './services/transcript-pages';
export { InvalidClaudeSessionIdError } from './errors/invalid-claude-session-id.error';
export { TranscriptCursorStaleError } from './errors/transcript-cursor-stale.error';
export { TranscriptNotFoundError } from './errors/transcript-not-found.error';
export { TranscriptTimeoutError } from './errors/transcript-timeout.error';
export { TranscriptUnavailableError } from './errors/transcript-unavailable.error';
export { TranscriptFollowLimitError } from './errors/transcript-follow-limit.error';
export type { FollowLimitScope } from './errors/transcript-follow-limit.error';
export { TranscriptFollowLiveHereError } from './errors/transcript-follow-live-here.error';
export { PromptImageTypeUnsupportedError } from './errors/prompt-image-type-unsupported.error';
export { PromptImageTooLargeError } from './errors/prompt-image-too-large.error';
