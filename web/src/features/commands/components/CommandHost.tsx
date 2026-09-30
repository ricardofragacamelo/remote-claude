import { useEffect } from 'react';
import { Command as CommandIcon } from 'lucide-react';

import { useCommands } from '../hooks/useCommands';
import type { CommandDeclaration } from '../hooks/useCommands';
import { useKeybindings } from '../hooks/useKeybindings';
import { COMMANDS_PREFIX, paletteModes, usePalette } from '../store/palette.store';
import type { PaletteMode } from '../types/command';
import { CommandPalette } from './CommandPalette';
import { CommandsMode } from './CommandsMode';

/** The palette's own mode: the commands, behind `>`. */
const COMMANDS_MODE: PaletteMode = {
  id: 'commands',
  position: 100,
  prefix: COMMANDS_PREFIX,
  placeholderKey: 'palette.commands.placeholder',
  component: CommandsMode,
};

/**
 * `Ctrl/Cmd+Shift+P` — and `F1`, as the editor people know has it — open the palette, the one
 * shortcut that also fires with the focus in a text field (plan 06, S-120).
 */
const PALETTE_COMMANDS: readonly CommandDeclaration[] = [
  {
    id: 'palette.show',
    labelKey: 'command.palette.show',
    category: 'view',
    icon: CommandIcon,
    run: () => {
      usePalette.getState().show();
    },
    keys: [
      { key: 'Mod+Shift+P', context: 'global', allowInInput: true },
      { key: 'F1', context: 'global', allowInInput: true },
    ],
  },
];

/**
 * The commands of the app, live: the shortcuts listened to and the palette ready — mounted once,
 * by the frame.
 */
export function CommandHost(): React.JSX.Element {
  useKeybindings();
  useCommands(PALETTE_COMMANDS);

  useEffect(() => paletteModes.register(COMMANDS_MODE), []);

  // Signed out with the palette open: the next person to sign in does not find it open.
  useEffect(
    () => () => {
      usePalette.getState().close();
    },
    [],
  );

  return <CommandPalette />;
}
