// The public surface of the domain of the Claude extension (plan 28, B-36, B-37): what only Claude
// has as a rule — its account and installation, its menu, its output styles, its plugins and skills.
// The core never imports it; the composition and the rest of the extension do.
export { PluginMarketplaceNotAllowedError } from './errors/plugin-marketplace-not-allowed.error';
export { PluginNotFoundError } from './errors/plugin-not-found.error';
export { PluginPathInvalidError } from './errors/plugin-path-invalid.error';
export { PluginSourceUnavailableError } from './errors/plugin-source-unavailable.error';
export { SkillNameInvalidError } from './errors/skill-name-invalid.error';
export { accountStateOf } from './services/account-state';
export type { AccountState } from './services/account-state';
export {
  CLAUDE_COMMAND_MENU,
  SUGGESTED_COMMANDS,
  SYSTEM_SKILLS_PLUGIN,
  USER_SKILLS_PLUGIN,
} from './services/command-menu';
export {
  effectiveOutputStyle,
  NO_OUTPUT_STYLE,
  outputStyleForSession,
} from './services/output-style-defaults';
export type { FolderOutputStyle, OutputStyleDefaults } from './services/output-style-defaults';
export { claudeInitializationOf } from './value-objects/claude-installation.value-object';
export type {
  ClaudeAccount,
  ClaudeInitialization,
} from './value-objects/claude-installation.value-object';
