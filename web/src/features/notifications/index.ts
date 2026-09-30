/** Public surface of the `notifications` feature: the toasts, the centre, and the bell. */
export { NotificationBell } from './components/NotificationBell';
export { NotificationHost } from './components/NotificationHost';
export { useNotifications } from './store/notifications.store';
export type { NotificationEntry, PendingNotification } from './types/notification';
