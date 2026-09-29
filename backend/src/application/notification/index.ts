/** Public surface of the `notification` use cases. */
export { NotificationRegistry } from './notification-registry';
export { NotifyPermissionUseCase } from './notify-permission.use-case';
export type { NotifyOutcome, NotifyPermissionCommand } from './notify-permission.use-case';
export type { PushAudience } from './ports/push-audience.port';
export { PUSH_AUDIENCE } from './ports/push-audience.port';
export type { PushDelivery, PushOutcome, PushSender } from './ports/push.port';
export { PUSH_RETRY, PushDispatcher, retryDelayMs } from './push-dispatcher';
export type {
  Dispatch,
  PushExhaustion,
  PushRetryPolicy,
  PushRetryReporter,
} from './push-dispatcher';
export { PUSH_SENDER } from './ports/push.port';
export type { PushTokenRegistry } from './ports/push-token-registry.port';
export { PUSH_TOKEN_REGISTRY } from './ports/push-token-registry.port';
export {
  DeleteNotificationsUseCase,
  ListNotificationsUseCase,
  MarkNotificationsReadUseCase,
  NOTIFICATION_PAGE_SIZE,
  PurgeNotificationsUseCase,
  RecordNotificationUseCase,
} from './notification-history.use-cases';
export type { RecordNotificationCommand } from './notification-history.use-cases';
export type {
  NotificationHistoryRepository,
  NotificationPage,
  RecordedNotification,
} from './ports/notification-history.repository';
export { NOTIFICATION_HISTORY_REPOSITORY } from './ports/notification-history.repository';
