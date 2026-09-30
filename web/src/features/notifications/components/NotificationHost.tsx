import { useCallback } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

import { useCommands } from '@/features/commands';
import type { CommandDeclaration } from '@/features/commands';
import { Toaster } from '@/shared/components/ui/sonner';
import { useTheme } from '@/shared/hooks/useTheme';
import { notificationKeys } from '../hooks/notification-keys';
import { useConnectionNotices } from '../hooks/useConnectionNotices';
import { useNotificationHost } from '../hooks/useNotificationHost';
import { useNotifications } from '../store/notifications.store';
import type { PendingNotification } from '../types/notification';
import { NotificationCenter } from './NotificationCenter';
import { NotificationToast } from './NotificationToast';

/** How long a toast stays when nothing in it asks for an action. One that does, stays. */
const DURATION_MS = { info: 5_000, warning: 8_000, error: 8_000 } as const;

/** Puts a notification's toast on screen — or, for a burst, updates the one it already has. */
function showToast(notification: PendingNotification): void {
  toast.custom(
    (id) => (
      <NotificationToast
        notification={notification}
        onDismiss={() => {
          toast.dismiss(id);
        }}
      />
    ),
    {
      id: notification.clientId,
      duration:
        notification.actions.length > 0
          ? Number.POSITIVE_INFINITY
          : DURATION_MS[notification.severity],
    },
  );
}

/**
 * The notification centre of the app, live while somebody is signed in: the toasts, the centre,
 * the notices of the connection, and the commands to reach them from the palette.
 */
export function NotificationHost(): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme((state) => state.theme);
  const queryClient = useQueryClient();
  const doNotDisturb = useNotifications((state) => state.doNotDisturb);

  useNotificationHost(showToast);

  // The connection came back: what another device did meanwhile is on the server, and what this
  // window could not send is sent now.
  const restored = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    useNotifications.getState().outbox?.retryNow();
  }, [queryClient]);

  useConnectionNotices(restored);

  const commands: readonly CommandDeclaration[] = [
    {
      id: 'notifications.show',
      labelKey: 'command.notifications.show',
      category: 'notifications',
      icon: Bell,
      run: () => {
        useNotifications.getState().setCenterOpen(true);
      },
    },
    {
      id: 'notifications.doNotDisturb',
      labelKey: doNotDisturb
        ? 'command.notifications.doNotDisturbOff'
        : 'command.notifications.doNotDisturbOn',
      category: 'notifications',
      icon: BellOff,
      run: () => {
        const state = useNotifications.getState();
        state.setDoNotDisturb(!state.doNotDisturb);
      },
    },
  ];

  useCommands(commands);

  return (
    <>
      <Toaster theme={theme} containerAriaLabel={t('notifications.toasts.label')} />
      <NotificationCenter />
    </>
  );
}
