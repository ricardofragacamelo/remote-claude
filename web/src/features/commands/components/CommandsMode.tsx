import { useTranslation } from 'react-i18next';

import { CommandEmpty, CommandItem, CommandShortcut } from '@/shared/components/ui/command';
import { executeCommand } from '../hooks/execute-command';
import { usePaletteCommands } from '../hooks/usePaletteCommands';
import type { PaletteModeProps } from '../types/command';

/**
 * The `>` mode of the palette: every command available now, with its shortcut beside it. Picking
 * one closes the palette and runs it; a failure becomes a notification, and the palette is already
 * gone (plan 06, S-126).
 */
export function CommandsMode({ query, pick }: PaletteModeProps): React.JSX.Element {
  const { t } = useTranslation();
  const entries = usePaletteCommands(query);

  if (entries.length === 0) {
    return <CommandEmpty>{t('palette.commands.noMatch')}</CommandEmpty>;
  }

  return (
    <>
      {entries.map(({ command, text, shortcut }) => (
        <CommandItem
          key={command.id}
          value={command.id}
          onSelect={() => {
            pick(() => {
              void executeCommand(command.id, t);
            });
          }}
        >
          {command.icon !== undefined && <command.icon className="size-4 shrink-0" aria-hidden />}
          <span className="truncate">{text}</span>
          {shortcut !== null && <CommandShortcut>{shortcut.label}</CommandShortcut>}
        </CommandItem>
      ))}
    </>
  );
}
