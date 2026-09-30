import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { usePagedQuery } from '@/shared/hooks/usePagedQuery';
import {
  clearNotifications,
  deleteNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
} from '../services/notification.service';
import { useNotifications } from '../store/notifications.store';
import type {
  NotificationEntry,
  NotificationPage,
  PendingNotification,
} from '../types/notification';
import { notificationKeys } from './notification-keys';

/** The centre: what the server keeps, what this window has not sent yet, and what can be done. */
export interface NotificationCenter {
  /** The server's entries, newest first. */
  readonly entries: readonly NotificationEntry[];

  /** This window's, not on the server yet — listed first, and never lost when a send fails. */
  readonly pending: readonly PendingNotification[];

  /** What the bell counts: unread on the server, and what has not reached it. */
  readonly unread: number;
  readonly isLoading: boolean;
  readonly error: AppError | null;
  reload(): void;
  readonly hasMore: boolean;
  readonly isLoadingMore: boolean;
  readonly moreError: AppError | null;
  loadMore(): void;

  markRead(id: string): void;
  markAllRead(): void;
  remove(id: string): void;
  clearAll(): void;

  /** Clears one of this window's that the server does not have: it is not sent any more. */
  dismiss(clientId: string): void;

  /** A change is on its way, and a second one is not sent. */
  readonly isBusy: boolean;

  /** Why the last change was refused — said in the centre, never as one more notification. */
  readonly failure: AppError | null;
}

/**
 * The notification centre's data.
 *
 * The history is the **server's** (06 · D-17): it survives a reload and a change of device, "read"
 * is the same everywhere, and the list is read again when the window comes back. A change is not
 * optimistic — the server says, then the list is read again.
 */
export function useNotificationCenter(): NotificationCenter {
  const queryClient = useQueryClient();
  const pending = useNotifications((state) => state.pending);
  const outbox = useNotifications((state) => state.outbox);
  const busy = useRef(false);
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<AppError | null>(null);

  const query = usePagedQuery<NotificationPage>({
    queryKey: notificationKeys.list(),
    fetchPage: fetchNotifications,
    nextCursor: (page) => page.nextCursor,
    refetchOnWindowFocus: true,
  });

  const change = useCallback(
    (send: () => Promise<void>) => {
      if (busy.current) {
        return;
      }

      busy.current = true;
      setIsBusy(true);
      setFailure(null);

      void send()
        .then(() => queryClient.invalidateQueries({ queryKey: notificationKeys.all }))
        .catch((error: AppError) => {
          setFailure(error);
        })
        .finally(() => {
          busy.current = false;
          setIsBusy(false);
        });
    },
    [queryClient],
  );

  const entries = query.pages?.flatMap((page) => page.items) ?? [];
  const serverUnread = query.pages?.[0]?.unread ?? 0;

  return {
    entries,
    pending,
    unread: serverUnread + pending.length,
    isLoading: query.isLoading,
    error: query.error,
    reload: query.reload,
    hasMore: query.hasMore,
    isLoadingMore: query.isLoadingMore,
    moreError: query.moreError,
    loadMore: query.loadMore,
    markRead: (id) => {
      change(() => markNotificationsRead([id]));
    },
    markAllRead: () => {
      change(markAllNotificationsRead);
    },
    remove: (id) => {
      change(() => deleteNotification(id));
    },
    clearAll: () => {
      change(async () => {
        for (const each of pending) {
          outbox?.drop(each.clientId);
        }
        await clearNotifications();
      });
    },
    dismiss: (clientId) => {
      outbox?.drop(clientId);
    },
    isBusy,
    failure,
  };
}
