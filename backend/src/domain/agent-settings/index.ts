// The public surface of the domain of `agent-settings` (plan 28, B-36): the defaults a session of
// any engine opens with, by engine. Other modules reach it through this barrel only.
export { AgentSettingsForbiddenError } from './errors/agent-settings-forbidden.error';
export { AgentSettingsInputInvalidError } from './errors/agent-settings-input-invalid.error';
export type { AgentSettingsInputRule } from './errors/agent-settings-input-invalid.error';
export { DefaultModeNotAllowedError } from './errors/default-mode-not-allowed.error';
export { EngineSettingsNotFoundError } from './errors/engine-settings-not-found.error';
export { ModelNotAvailableError } from './errors/model-not-available.error';
export {
  effectiveDefaults,
  effectiveValue,
  isWithin,
  nearestOverride,
  valuesOf,
} from './services/defaults-resolution';
export { needsCatalogue, validateDefaults } from './services/defaults-validation';
export { defaultsForSession } from './services/session-defaults';
export type {
  ClientChoice,
  SessionDefaults,
  SessionDefaultsSource,
} from './services/session-defaults';
export {
  DEFAULT_FIELDS,
  NO_DEFAULTS,
  sameDefaults,
  THINKING_SETTINGS,
} from './value-objects/agent-defaults.value-object';
export type {
  AgentDefaults,
  DefaultField,
  DefaultsOrigin,
  EffectiveDefaults,
  EffectiveValue,
  FolderDefaults,
  ThinkingSetting,
} from './value-objects/agent-defaults.value-object';
