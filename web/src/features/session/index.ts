/** Public surface of the `session` feature. */
export { ConversationReader } from './components/ConversationReader';
export { registerSessionsView, SESSIONS_VIEW } from './components/sessions/registration';
export { registerClaudeChanges } from './register-changes';
export { registerClaudeContext } from './register-context';
export { ChangesView } from './components/changes/ChangesView';
export { ClaudePanel } from './components/panel/ClaudePanel';
export { PanelCommands } from './components/panel/PanelCommands';
export { Notifiers } from './components/panel/Notifiers';
export { usePanelSessions } from './hooks/usePanelTabs';
export { useClaudePanel } from './hooks/useClaudePanel';
export type { EffortLevel, PanelPane } from './store/claude-panel.store';
export type { InstallationModel } from './types/insight';
export { forgetClaudePanel } from './store/claude-panel.store';
export { SessionScreen } from './components/SessionScreen';
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
