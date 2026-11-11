import { useCallback, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Command as CommandIcon } from 'lucide-react';

import { CommandHost, usePalette } from '@/features/commands';
import { NotificationBell, NotificationHost } from '@/features/notifications';
import { useRuleExpiryReminder } from '@/features/permission';
import { statusBarItems } from '@/features/workbench';
import { FolderDialogHost } from '@/features/workspace';
import { useRegistry } from '@/shared/hooks/useRegistry';
import { commandHosts } from './command-hosts';
import { manageMenu } from './global-navigation';
import { useOpenFolder } from './navigation';
import { useAppCommands } from './useAppCommands';

/**
 * The services of the shell, for somebody signed in: the commands and their shortcuts, the palette,
 * the one "Open folder" dialog, the notification centre, the once-a-day rule-expiry reminder (plan
 * 15, B-25) — and where each is reached from outside its own feature: the palette from the "manage"
 * menu, the centre from the bell of the status bar.
 */
export function ShellHosts(): React.JSX.Element {
  const navigate = useNavigate();
  const openFolder = useOpenFolder();
  const welcome = useCallback(() => {
    void navigate({ to: '/' });
  }, [navigate]);
  const hosts = useRegistry(commandHosts);

  useAppCommands();
  useRuleExpiryReminder();

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
      {hosts.map((host) => (
        <host.component key={host.id} />
      ))}
    </>
  );
}
