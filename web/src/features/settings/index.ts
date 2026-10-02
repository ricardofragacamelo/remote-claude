/**
 * Public surface of the `settings` feature — the app's Settings, and the registry of their sections,
 * where plan 07 registers "Editor" and plan 12 "Terminal". Never Claude's settings: plan 13.
 */
export { SettingChoice } from './components/SettingChoice';
export type { Choice, SettingChoiceProps } from './components/SettingChoice';
export { SettingsScreen } from './components/SettingsScreen';
export type { SettingsScreenProps } from './components/SettingsScreen';
export {
  assertAppSection,
  createSettingsSections,
  firstSectionId,
  sectionFor,
  settingsSections,
} from './store/settings-sections';
export type { SettingMatch, SettingOption, SettingsSectionEntry } from './types/settings';
