// The public surface of the application layer of the Claude extension (plan 28, B-36): its account,
// installation and test of the connection, and the output style it keeps. The core never imports it;
// the composition and the extension's adapters do.
export { ClaudeModelCatalog } from './claude-model-catalog';
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
} from './installation.use-cases';
export type { AccountView, InstallationView } from './installation.use-cases';
export {
  ClaudeSessionDefaults,
  outputStyleView,
  ReadOutputStyleUseCase,
  SaveOutputStyleUseCase,
} from './output-style.use-cases';
export type { OutputStyleDependencies, OutputStyleView } from './output-style.use-cases';
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
export { OUTPUT_STYLE_DEFAULTS_REPOSITORY } from './ports/output-style-defaults.repository';
export type { OutputStyleDefaultsRepository } from './ports/output-style-defaults.repository';
export { PLUGIN_REPOSITORY } from './ports/plugin-repository.port';
export type { PluginRepository, PluginWrite, StoredPlugin } from './ports/plugin-repository.port';
export { PLUGIN_MANIFEST_READER } from './ports/plugin-manifest-reader.port';
export type {
  PluginManifestRead,
  PluginManifestReadError,
  PluginManifestReader,
} from './ports/plugin-manifest-reader.port';
export { MARKETPLACE_PLUGIN_SOURCE } from './ports/marketplace-plugin-source.port';
export type {
  MarketplacePluginSource,
  MarketplaceSourceFailure,
  PreparedMarketplacePlugin,
} from './ports/marketplace-plugin-source.port';
export {
  AddLocalPluginUseCase,
  ListPluginsUseCase,
  ownedPlugin,
  pluginEvent,
  PreviewLocalPluginUseCase,
  RemovePluginUseCase,
  SetPluginEnabledUseCase,
  viewOf,
} from './plugin.use-cases';
export type {
  LocalPluginPreview,
  PluginAuditKind,
  PluginDependencies,
  PluginView,
} from './plugin.use-cases';
export {
  AddMarketplacePluginUseCase,
  ApplyMarketplacePluginUpdateUseCase,
  CheckMarketplacePluginUpdateUseCase,
  ListMarketplacePluginsUseCase,
  ListMarketplacesUseCase,
} from './marketplace-plugin.use-cases';
export type { MarketplacePluginUpdateCheck } from './marketplace-plugin.use-cases';
export { isSafePathSegment, marketplacePluginDestination } from './marketplace-plugin-path';
export { userPathSegment } from './user-path-segment';
export { ReadProjectConfigUseCase } from './project-config.use-cases';
export type { ProjectConfigDependencies } from './project-config.use-cases';
export { SKILL_SOURCES } from './ports/skill-sources.port';
export type { SkillSourceCandidate, SkillSources } from './ports/skill-sources.port';
export { LIVE_LOADED_STATE } from './ports/live-loaded-state.port';
export type { LiveLoadedState } from './ports/live-loaded-state.port';
export { PROJECT_CONFIG_SOURCE } from './ports/project-config-source.port';
export type {
  MemoryFileStat,
  ProjectAgentFile,
  ProjectCommandFile,
  ProjectConfigFileRead,
  ProjectConfigReadRequest,
  ProjectConfigSource,
  ProjectOutputStyleFile,
  ProjectPermissionsDeclaration,
} from './ports/project-config-source.port';
