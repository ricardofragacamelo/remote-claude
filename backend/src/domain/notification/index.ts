/** Public surface of the `notification` domain. */
export { PushMessage } from './entities/push-message.entity';
export type { PermissionReference, PushParams, PushTarget } from './entities/push-message.entity';
export { PUSH_KINDS } from './value-objects/push-kind.value-object';
export type { PushKind } from './value-objects/push-kind.value-object';
export {
  NOTIFICATION_HISTORY_LIMIT,
  NOTIFICATION_RETENTION_HOURS,
  NotificationEntry,
} from './entities/notification-entry.entity';
export type {
  NotificationDraft,
  NotificationEntrySnapshot,
} from './entities/notification-entry.entity';
export { NOTIFICATION_SEVERITIES } from './value-objects/notification-severity.value-object';
export type { NotificationSeverity } from './value-objects/notification-severity.value-object';
export {
  NOTIFICATION_CATALOGUE,
  NOTIFICATION_PARAM_MAX_LENGTH,
  problemsOf,
} from './services/notification-catalogue';
export type {
  NotificationKind,
  NotificationParams,
  NotificationProblem,
} from './services/notification-catalogue';
export { NotificationRejectedError } from './errors/notification-rejected.error';
