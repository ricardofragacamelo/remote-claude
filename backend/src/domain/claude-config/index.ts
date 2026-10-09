export { ClaudeConfigForbiddenError } from './errors/claude-config-forbidden.error';
export { ClaudeConfigInputInvalidError } from './errors/claude-config-input-invalid.error';
export type { ClaudeConfigInputRule } from './errors/claude-config-input-invalid.error';
export { DefaultModeNotAllowedError } from './errors/default-mode-not-allowed.error';
export { McpApprovalStaleError } from './errors/mcp-approval-stale.error';
export { McpServerConfigInvalidError } from './errors/mcp-server-config-invalid.error';
export { McpServerNameTakenError } from './errors/mcp-server-name-taken.error';
export { McpServerNotFoundError } from './errors/mcp-server-not-found.error';
export { ModelNotAvailableError } from './errors/model-not-available.error';
export { PluginMarketplaceNotAllowedError } from './errors/plugin-marketplace-not-allowed.error';
export { PluginNotFoundError } from './errors/plugin-not-found.error';
export { PluginPathInvalidError } from './errors/plugin-path-invalid.error';
export { PluginSourceUnavailableError } from './errors/plugin-source-unavailable.error';
export { SecretStoreUnavailableError } from './errors/secret-store-unavailable.error';
export { accountStateOf } from './services/account-state';
export type { AccountState } from './services/account-state';
export {
  effectiveDefaults,
  isWithin,
  nearestOverride,
  valuesOf,
} from './services/defaults-resolution';
export { needsCatalogue, validateDefaults } from './services/defaults-validation';
export { defaultsForSession } from './services/session-defaults';
export type {
  ClientChoice,
  InstallationOffer,
  SessionDefaults,
  SessionDefaultsSource,
} from './services/session-defaults';
export {
  DEFAULT_FIELDS,
  NO_DEFAULTS,
  sameDefaults,
  THINKING_SETTINGS,
} from './value-objects/claude-defaults.value-object';
export type {
  ClaudeDefaults,
  DefaultField,
  DefaultPermissionMode,
  DefaultsOrigin,
  EffectiveDefaults,
  EffectiveValue,
  FolderDefaults,
  ThinkingSetting,
} from './value-objects/claude-defaults.value-object';
