import { useTranslation } from 'react-i18next';

import type { Command, CommandCategory, ShortcutLabel } from '../types/command';
import { commandLabel } from './command-label';
import { matchesSearch } from './palette-filter';
import { useRegisteredCommands, useShortcutLabels } from './useShortcut';

/** The name of each category, as the palette writes it before a label — named in full here. */
export const CATEGORY_KEYS: Readonly<Record<CommandCategory, string>> = {
  file: 'command.category.file',
  view: 'command.category.view',
  go: 'command.category.go',
  preferences: 'command.category.preferences',
  help: 'command.category.help',
  notifications: 'command.category.notifications',
};

/** One option of the palette. */
export interface PaletteCommand {
  readonly command: Command;

  /** "File: Open folder…" — the category, then the label, translated. */
  readonly text: string;
  readonly shortcut: ShortcutLabel | null;
}

/**
 * The commands the palette offers for a search: only those available **now** — a command that
 * cannot run does not show (plan 06, S-123) — matched on the category and the label as translated,
 * in the order of what they say.
 */
export function usePaletteCommands(query: string): readonly PaletteCommand[] {
  const { t } = useTranslation();
  const commands = useRegisteredCommands();
  const shortcuts = useShortcutLabels();

  return commands
    .filter((command) => command.when?.() !== false)
    .map((command) => ({
      command,
      text: `${t(CATEGORY_KEYS[command.category])}: ${commandLabel(command, t)}`,
      shortcut: shortcuts.get(command.id) ?? null,
    }))
    .filter((entry) => matchesSearch(entry.text, query))
    .sort((left, right) => left.text.localeCompare(right.text));
}
