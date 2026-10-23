// The public surface of the core's "agent settings" (plan 28, B-36, B-38): the sections every engine
// has, by engine — its models and the defaults a session opens with, its MCP servers. Where an
// engine's extension plugs its own section, its own field of the defaults form, and its own help
// into the core's registries. The route mounts the screen; the navigation and the commands link to
// it through the address builder.
export { AgentSettingsScreen } from './components/AgentSettingsScreen';
export type { AgentSettingsScreenProps } from './components/AgentSettingsScreen';
export { DefaultsForm } from './components/DefaultsForm';
export type { DefaultsFormProps } from './components/DefaultsForm';
export { FolderPicker } from './components/FolderPicker';
export { ModelsSection } from './components/ModelsSection';
export { Nothing } from './components/Nothing';
export { agentSettingsHref, readAgentSettingsSearch } from './types/location';
export type { AgentSettingsLocation, AgentSettingsSearch } from './types/location';
export type { SectionBodyProps, AgentSettingsSection } from './types/section';
export {
  agentSettingsSections,
  createAgentSettingsSections,
  firstAgentSectionId,
  sectionFor,
  sectionsForCapabilities,
  sectionsForEngine,
} from './store/agent-settings-sections';
export { defaultsExtraFields } from './store/defaults-extra-fields';
export type { DefaultsExtraField, DefaultsExtraFieldState } from './store/defaults-extra-fields';
export { agentSettingsShortcuts } from './store/agent-settings-shortcuts';
export type { AgentSettingsShortcut } from './store/agent-settings-shortcuts';
export { DEFAULT_FIELDS, NO_DEFAULTS, THINKING_SETTINGS } from './types/defaults';
export type {
  AgentDefaults,
  AgentModel,
  DefaultField,
  DefaultMode,
  DefaultsOrigin,
  DefaultsView,
  EffectiveValue,
  EffortLevel,
  ThinkingSetting,
} from './types/defaults';
export { useDefaults } from './hooks/useDefaults';
export type { Defaults, DefaultsScope } from './hooks/useDefaults';
export { useFolderChoices } from './hooks/useFolderChoices';
export { readStateOf } from './hooks/read-state';
export type { ReadState } from './hooks/read-state';
export { agentSettingsKeys } from './hooks/agent-settings-keys';
