// The public surface of the application layer of `claude-config` (plan 13). Other modules reach it
// through this barrel only.
export {
  ACCOUNT_TTL_MS,
  CATALOGUE_CAPACITY,
  ClaudeInstallationCatalog,
} from './installation-catalog';
export {
  CheckModelUseCase,
  ModelChecks,
  ReadAccountUseCase,
  ReadInstallationUseCase,
  ReadModelsUseCase,
} from './installation.use-cases';
export type { AccountView, InstallationView, ModelsView } from './installation.use-cases';
export {
  ClearFolderDefaultsUseCase,
  ReadDefaultsUseCase,
  SaveDefaultsUseCase,
} from './defaults.use-cases';
export type { DefaultsDependencies, DefaultsView } from './defaults.use-cases';
export { ComposeSessionConfigurationUseCase } from './compose-session-configuration.use-case';
export type {
  SessionConfiguration as ClaudeSessionConfiguration,
  SessionConfigurationQuery,
} from './compose-session-configuration.use-case';
export { CLAUDE_DEFAULTS_REPOSITORY } from './ports/claude-defaults.repository';
export type { ClaudeDefaultsRepository } from './ports/claude-defaults.repository';
export { FOLDER_ACCESS } from './ports/folder-access.port';
export type { FolderAccess } from './ports/folder-access.port';
export {
  INSTALLATION_FACTS,
  INSTALLATION_PROBE,
  LIVE_INSTALLATION,
} from './ports/installation.ports';
export type {
  InstallationAnswer,
  InstallationFacts,
  InstallationProbe,
  LiveInstallation,
  ReadVersion,
} from './ports/installation.ports';
export { MODEL_CHECK } from './ports/model-check.port';
export type { ModelCheck, ModelCheckOutcome, ModelCheckResult } from './ports/model-check.port';
