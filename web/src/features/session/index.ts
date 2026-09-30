/** Public surface of the `session` feature. */
export { HistoryScreen } from './components/HistoryScreen';
export { SessionScreen } from './components/SessionScreen';
export { SessionStarter } from './components/SessionStarter';
export { useSessionStarter } from './hooks/useSessionStarter';
export { useLiveSession } from './hooks/useLiveSession';
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
export type { ConversationOrigin, ConversationSummary } from './types/history';
