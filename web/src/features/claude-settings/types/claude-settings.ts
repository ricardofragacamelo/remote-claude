/**
 * The sections of "Configuração do Claude", in the order the navigation shows them (plan 13, B-09).
 *
 * The section is in the address, with the folder: a link pasted on another device reproduces the
 * screen (docs/architecture/web/04-state-and-data.md#a-url-é-estado).
 */
export const CLAUDE_SETTINGS_SECTIONS = [
  'account',
  'installation',
  'models',
  'mcp',
  'plugins',
  'skills',
  'project',
] as const;

export type ClaudeSettingsSection = (typeof CLAUDE_SETTINGS_SECTIONS)[number];

/** Where the screen is: a section, and the folder whose overrides and project it shows. */
export interface ClaudeSettingsLocation {
  readonly section: ClaudeSettingsSection;

  /** An absolute folder, or none — the user's own defaults, with no folder in view. */
  readonly folder?: string;
}

/** Whether a value names one of the sections. */
export function isClaudeSettingsSection(value: unknown): value is ClaudeSettingsSection {
  return (
    typeof value === 'string' && (CLAUDE_SETTINGS_SECTIONS as readonly string[]).includes(value)
  );
}
