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
export type { TranscriptAudience } from './services/transcript-visibility';
export { pageFromTail, pageOfSessions } from './services/transcript-pages';
export type { Page, SessionListCursor } from './services/transcript-pages';
export { InvalidClaudeSessionIdError } from './errors/invalid-claude-session-id.error';
export { TranscriptCursorStaleError } from './errors/transcript-cursor-stale.error';
export { TranscriptNotFoundError } from './errors/transcript-not-found.error';
export { TranscriptTimeoutError } from './errors/transcript-timeout.error';
export { TranscriptUnavailableError } from './errors/transcript-unavailable.error';
