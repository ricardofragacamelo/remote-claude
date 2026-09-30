import { useEffect } from 'react';
import { FolderOpen, History } from 'lucide-react';

import { paletteModes, useCommands, usePalette } from '@/features/commands';
import type { CommandDeclaration, PaletteMode } from '@/features/commands';
import { useFolderDialog } from '../store/folder-dialog.store';
import type { FolderRoutes } from '../store/folder-dialog.store';
import { OpenFolderDialog } from './OpenFolderDialog';
import { RecentFoldersMenu } from './RecentFoldersMenu';
import { RecentFoldersMode } from './RecentFoldersMode';

/** "Open recent" of the palette: entered by its command, with no prefix of its own. */
const RECENT_MODE: PaletteMode = {
  id: 'recent',
  position: 200,
  placeholderKey: 'workspace.recentMode.placeholder',
  component: RecentFoldersMode,
};

/**
 * `Ctrl+O` — `Cmd+O` on a Mac — opens "Open folder" from anywhere, as it did on the welcome screen
 * alone until the registry took it over
 * ([D-24](../../../../../docs/plans/06-workbench/decisions.md#d-24--o-atalho-do-abrir-pasta-e-quando-a-lista-de-recentes-ganha-busca)).
 * The browser's own "open file" is what the key would do otherwise.
 */
const FOLDER_COMMANDS: readonly CommandDeclaration[] = [
  {
    id: 'workspace.openFolder',
    labelKey: 'command.workspace.openFolder',
    category: 'file',
    icon: FolderOpen,
    fileMenu: { group: 'open', order: 100 },
    run: () => {
      useFolderDialog.getState().show();
    },
    keys: [{ key: 'Mod+O', context: 'global' }],
  },
  {
    id: 'workspace.openRecent',
    labelKey: 'command.workspace.openRecent',
    category: 'file',
    icon: History,
    fileMenu: { group: 'open', order: 200, submenu: RecentFoldersMenu },
    run: () => {
      usePalette.getState().show(RECENT_MODE.id);
    },
  },
];

export type FolderDialogHostProps = FolderRoutes;

/**
 * The "Open folder" dialog of the whole app, and the commands that reach it and the recent folders
 * — mounted once, by the frame, so the File menu and the palette work on every screen.
 */
export function FolderDialogHost({ open, welcome }: FolderDialogHostProps): React.JSX.Element {
  const isOpen = useFolderDialog((state) => state.open);
  const startAt = useFolderDialog((state) => state.startAt);
  const setOpen = useFolderDialog((state) => state.setOpen);

  useCommands(FOLDER_COMMANDS);

  useEffect(() => paletteModes.register(RECENT_MODE), []);

  useEffect(() => {
    useFolderDialog.setState({ routes: { open, welcome } });
    return () => {
      useFolderDialog.setState({ routes: null, open: false, startAt: null });
    };
  }, [open, welcome]);

  return (
    <OpenFolderDialog
      open={isOpen}
      startAt={startAt}
      onOpenChange={setOpen}
      onOpen={(path) => {
        setOpen(false);
        open(path);
      }}
    />
  );
}
