import { create } from 'zustand';

import { readVisitor, writeVisitor } from '@/shared/lib/visitor-storage';
import type { StorageSource } from '@/shared/lib/visitor-storage';
import type { Outbox } from '../hooks/notification-outbox';
import type { PendingNotification } from '../types/notification';

const DO_NOT_DISTURB_KEY = 'notifications.doNotDisturb';

/** Whether this browser was left in "do not disturb" — off for somebody who never turned it on. */
export function initialDoNotDisturb(storage?: StorageSource): boolean {
  return (
    readVisitor(
      DO_NOT_DISTURB_KEY,
      (value) => (typeof value === 'boolean' ? value : undefined),
      storage,
    ) ?? false
  );
}

export interface NotificationsState {
  /** What this window raised that the server does not have yet, newest first. */
  readonly pending: readonly PendingNotification[];

  /** Where those wait — present while somebody is signed in. */
  readonly outbox: Outbox | null;

  /** Whether the centre is open. */
  readonly centerOpen: boolean;

  /**
   * "Do not disturb": no toast, and the history still kept. Per visitor — a phone left silent does
   * not silence the desktop (06 · D-17).
   */
  readonly doNotDisturb: boolean;

  setCenterOpen(open: boolean): void;
  toggleCenter(): void;
  setDoNotDisturb(on: boolean): void;
}

/** The notification centre of this window. */
export const useNotifications = create<NotificationsState>((set, get) => ({
  pending: [],
  outbox: null,
  centerOpen: false,
  doNotDisturb: initialDoNotDisturb(),

  setCenterOpen: (centerOpen) => {
    set({ centerOpen });
  },
  toggleCenter: () => {
    set({ centerOpen: !get().centerOpen });
  },
  setDoNotDisturb: (doNotDisturb) => {
    writeVisitor(DO_NOT_DISTURB_KEY, doNotDisturb);
    set({ doNotDisturb });
  },
}));
