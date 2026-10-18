/** Public surface of the `session` feature. */
export { ConversationReader } from './components/ConversationReader';
export { registerSessionsView, SESSIONS_VIEW } from './components/sessions/registration';
export { registerAgentChanges } from './register-changes';
export { registerAgentContext } from './register-context';
export { ChangesView } from './components/changes/ChangesView';
export { AgentPanel } from './components/panel/AgentPanel';
export { PanelCommands } from './components/panel/PanelCommands';
export { Notifiers } from './components/panel/Notifiers';
export { usePanelSessions } from './hooks/usePanelTabs';
export { useAgentPanel } from './hooks/useAgentPanel';
export type { EffortLevel, PanelMode, PanelPane } from './store/agent-panel.store';
export { useActiveAgentName, useEngineCapabilities, useEngines } from './hooks/useEngines';
export type { Engines } from './hooks/useEngines';
export { levelName } from './lib/effort-levels';
export type { InstallationModel } from './types/insight';
export { forgetAgentPanel } from './store/agent-panel.store';
export { SessionScreen } from './components/SessionScreen';
export { useLiveSession } from './hooks/useLiveSession';
export { useSetPermissionMode } from './hooks/useSetPermissionMode';
export { SESSION_LINK_GONE, useSessionLink } from './hooks/useSessionLink';
export type { SessionLinkState } from './hooks/useSessionLink';
export { KeepSessionAttached } from './components/KeepSessionAttached';
export { KeepAgentNames } from './components/KeepAgentNames';
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
