/** Public surface of the `session` feature. */
export { ConversationReader } from './components/ConversationReader';
export { registerSessionsView, SESSIONS_VIEW } from './components/sessions/registration';
export { SessionScreen } from './components/SessionScreen';
export { SessionStarter } from './components/SessionStarter';
export { useSessionStarter } from './hooks/useSessionStarter';
export { useLiveSession } from './hooks/useLiveSession';
export { useSetPermissionMode } from './hooks/useSetPermissionMode';
export { SESSION_LINK_GONE, useSessionLink } from './hooks/useSessionLink';
export type { SessionLinkState } from './hooks/useSessionLink';
export { KeepSessionAttached } from './components/KeepSessionAttached';
export {
  createLiveSessionStore,
  forgetLiveSessions,
  liveSessionStoreOf,
} from './store/live-session.store';
export type { LiveSessionStore } from './store/live-session.store';
export type {
  SessionCloseReason,
  SessionStatus,
  StreamMessage,
  ToolExecution,
} from './types/live-session';
export { toConversationSummary } from './services/history.service';
export type {
  ConversationActivity,
  ConversationOrigin,
  ConversationSummary,
} from './types/history';
