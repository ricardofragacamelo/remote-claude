import { useCallback, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Command as CommandIcon } from 'lucide-react';

import { CommandHost, usePalette } from '@/features/commands';
import { NotificationBell, NotificationHost } from '@/features/notifications';
import { statusBarItems } from '@/features/workbench';
import { FolderDialogHost } from '@/features/workspace';
import { manageMenu } from './global-navigation';
import { useOpenFolder } from './navigation';
import { useAppCommands } from './useAppCommands';

/**
 * The services of the shell, for somebody signed in: the commands and their shortcuts, the palette,
 * the one "Open folder" dialog, the notification centre — and where each is reached from outside
 * its own feature: the palette from the "manage" menu, the centre from the bell of the status bar.
 */
export function ShellHosts(): React.JSX.Element {
  const navigate = useNavigate();
  const openFolder = useOpenFolder();
  const welcome = useCallback(() => {
    void navigate({ to: '/' });
  }, [navigate]);

  useAppCommands();

  useEffect(
    () =>
      manageMenu.register({
        id: 'palette',
        position: 100,
        labelKey: 'command.palette.show',
        icon: CommandIcon,
        run: () => {
          usePalette.getState().show();
        },
      }),
    [],
  );

  useEffect(
    () =>
      statusBarItems.register({
        id: 'notifications',
        side: 'right',
        position: 400,
        component: NotificationBell,
      }),
    [],
  );

  return (
    <>
      <CommandHost />
      <FolderDialogHost open={openFolder} welcome={welcome} />
      <NotificationHost />
    </>
  );
}
