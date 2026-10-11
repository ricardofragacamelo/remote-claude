// The public surface of the application layer of the Claude extension (plan 28, B-36): its account,
// installation and test of the connection, the output style it keeps, and the routes of plan 13 kept
// for the previous protocol. The core never imports it; the composition and the extension's adapters
// do.
export { ClaudeModelCatalog } from './claude-model-catalog';
export { ACCOUNT_TTL_MS, CATALOGUE_CAPACITY, ClaudeInstallationCatalog } from './installation-catalog';
export {
  CheckModelUseCase,
  ModelChecks,
  ReadAccountUseCase,
  ReadInstallationUseCase,
} from './installation.use-cases';
export type { AccountView, InstallationView } from './installation.use-cases';
export { LegacyDefaultsUseCases } from './legacy-defaults.use-cases';
export type {
  LegacyDefaults,
  LegacyDefaultsDependencies,
  LegacyDefaultsView,
} from './legacy-defaults.use-cases';
export {
  ClaudeSessionDefaults,
  outputStyleView,
  ReadOutputStyleUseCase,
  SaveOutputStyleUseCase,
} from './output-style.use-cases';
export type { OutputStyleDependencies, OutputStyleView } from './output-style.use-cases';
export { INSTALLATION_FACTS, INSTALLATION_PROBE, LIVE_INSTALLATION } from './ports/installation.ports';
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
