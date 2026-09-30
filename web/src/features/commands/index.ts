/**
 * Public surface of the `commands` feature — the registry of commands and shortcuts, the palette
 * and the File menu. The plans after 06 register what is theirs through here, never by a deep path.
 */
export { CommandHost } from './components/CommandHost';
export { FileMenu } from './components/FileMenu';
export { afterClose, executeCommand } from './hooks/execute-command';
export { matchesSearch } from './hooks/palette-filter';
export { useCommands } from './hooks/useCommands';
export type { CommandDeclaration } from './hooks/useCommands';
export { useKeyContext } from './hooks/useKeyContext';
export { useScreenShortcuts, useShortcut } from './hooks/useShortcut';
export { commandRegistry } from './store/command-registry';
export { paletteModes, usePalette } from './store/palette.store';
export type {
  Command,
  CommandCategory,
  FileMenuPlacement,
  Keybinding,
  PaletteMode,
  PaletteModeProps,
  ShortcutLabel,
} from './types/command';
