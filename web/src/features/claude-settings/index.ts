// The public surface of "Configuração do Claude" (plan 13). The route mounts the screen; other
// features link to it through the address builder.
export { ClaudeSettingsScreen } from './components/ClaudeSettingsScreen';
export type { ClaudeSettingsScreenProps } from './components/ClaudeSettingsScreen';
export { claudeSettingsHref, readClaudeSettingsSearch } from './lib/claude-settings-search';
export { claudeSettingsHelp } from './lib/claude-settings-help';
export { CLAUDE_SETTINGS_SECTIONS, isClaudeSettingsSection } from './types/claude-settings';
export type { ClaudeSettingsLocation, ClaudeSettingsSection } from './types/claude-settings';
