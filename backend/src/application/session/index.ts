/** Public surface of the `session` use cases. */
export { AttachSessionUseCase } from './attach-session.use-case';
export { StartSessionUseCase } from './start-session.use-case';
export type { SessionDefaults, SessionProvenance } from './start-session.use-case';
export type { StartSessionCommand } from './commands/start-session.command';
export {
  CloseSessionUseCase,
  InterruptSessionUseCase,
  PromptSessionUseCase,
  SetSessionModelUseCase,
  SetSessionPermissionModeUseCase,
} from './drive-session.use-cases';
export { SessionRegistry } from './session-registry';
export { observedStatus } from './session-status';
export type { LiveSession } from './session-registry';
export type {
  ClaudeSessionHandle,
  ClaudeSessionPort,
  ClaudeSessionStart,
  SessionEvent,
} from './ports/claude-session.port';
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
export type { ToolInvocation, ToolInvocationRecorder } from './ports/tool-invocation.port';
export { TOOL_INVOCATION_RECORDER } from './ports/tool-invocation.port';
export type { WorkspaceResolver } from './ports/workspace-resolver.port';
export { WORKSPACE_RESOLVER } from './ports/workspace-resolver.port';
export type { SessionOrigin, SessionOriginRepository } from './ports/session-origin.repository';
export {
  CLAUDE_SESSION_ID_GENERATOR,
  SESSION_ORIGIN_REPOSITORY,
} from './ports/session-origin.repository';
