/** Public surface of the `session` domain. Another domain imports this file, never a deep path. */
export { Session } from './entities/session.entity';
export type { SessionCloseReason, SessionOpening } from './entities/session.entity';
export { SessionFileState } from './entities/session-file-state.entity';
export type { SessionFileStateSnapshot } from './entities/session-file-state.entity';
export { TurnFileCheckpoint } from './entities/turn-file-checkpoint.entity';
export type {
  FilePresence,
  Restorability,
  TurnFileCheckpointSnapshot,
} from './entities/turn-file-checkpoint.entity';
export { SessionId } from './value-objects/session-id.value-object';
export { PERMISSION_MODES, isPermissionMode } from './value-objects/permission-mode.value-object';
export type { PermissionMode } from './value-objects/permission-mode.value-object';
export {
  ALLOWED_TRANSITIONS,
  SESSION_STATUSES,
  canTransition,
} from './value-objects/session-status.value-object';
export type { SessionStatus } from './value-objects/session-status.value-object';
export { statusFor } from './services/session-status.projection';
export { ClaudeUnavailableError } from './errors/claude-unavailable.error';
export { InvalidSessionIdError } from './errors/invalid-session-id.error';
export { InvalidSessionTransitionError } from './errors/invalid-session-transition.error';
export { SessionForbiddenError } from './errors/session-forbidden.error';
export { SessionClosedError } from './errors/session-closed.error';
export { SessionLimitReachedError } from './errors/session-limit-reached.error';
export { SessionNotFoundError } from './errors/session-not-found.error';
