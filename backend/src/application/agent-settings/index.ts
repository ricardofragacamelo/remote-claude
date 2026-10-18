// The public surface of the application layer of `agent-settings` (plan 28, B-36): the defaults a
// session of any engine opens with, by engine. Other modules — and the engines' extensions — reach
// it through this barrel only.
export { ComposeSessionConfigurationUseCase } from './compose-session-configuration.use-case';
export type {
  SessionConfiguration as AgentSessionConfiguration,
  SessionConfigurationQuery,
} from './compose-session-configuration.use-case';
export {
  ClearFolderDefaultsUseCase,
  DEFAULTS_CHANGED,
  ReadDefaultsUseCase,
  SaveDefaultsUseCase,
  defaultsChangedEvent,
} from './defaults.use-cases';
export type { DefaultsDependencies, DefaultsView } from './defaults.use-cases';
export { EngineSettings } from './engine-settings';
export { ReadModelsUseCase } from './models.use-case';
export type { ModelsView } from './models.use-case';
export { AGENT_DEFAULTS_REPOSITORY } from './ports/agent-defaults.repository';
export type { AgentDefaultsRepository, StoredDefaults } from './ports/agent-defaults.repository';
export type {
  EngineModelCatalog,
  EngineModels,
  EngineSessionDefaults,
  EngineSessionOptions,
} from './ports/engine-settings.ports';
export { FOLDER_ACCESS } from './ports/folder-access.port';
export type { FolderAccess } from './ports/folder-access.port';
