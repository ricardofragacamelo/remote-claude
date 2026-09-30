import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { onNotify } from '@/shared/lib/notify';
import { recordNotification } from '../services/notification.service';
import { useNotifications } from '../store/notifications.store';
import type { PendingNotification } from '../types/notification';
import { createOutbox } from './notification-outbox';
import { notificationKeys } from './notification-keys';

/**
 * Listens to `notify()` while somebody is signed in: every notification goes to the outbox — which
 * groups a burst and keeps it on the server — and, unless "do not disturb" is on, to a toast.
 *
 * A toast of a burst is the same toast, its count going up, never one per repetition.
 *
 * @param show puts a toast on screen, or updates the one of the same entry; has to be stable
 */
export function useNotificationHost(show: (pending: PendingNotification) => void): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const outbox = createOutbox({
      send: recordNotification,
      onChange: (pending) => {
        useNotifications.setState({ pending });
      },
      onSaved: () => {
        void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      },
    });

    useNotifications.setState({ outbox });

    const stop = onNotify((notification) => {
      const entry = outbox.add(notification);

      if (!useNotifications.getState().doNotDisturb) {
        show(entry);
      }
    });

    return () => {
      stop();
      outbox.dispose();
      useNotifications.setState({ outbox: null, pending: [], centerOpen: false });
    };
  }, [queryClient, show]);
}
