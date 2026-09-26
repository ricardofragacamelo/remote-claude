/** Public surface of the `notification` use cases. */
export { NotificationRegistry } from './notification-registry';
export { NotifyPermissionUseCase } from './notify-permission.use-case';
export type { NotifyOutcome, NotifyPermissionCommand } from './notify-permission.use-case';
export type { PushAudience } from './ports/push-audience.port';
export { PUSH_AUDIENCE } from './ports/push-audience.port';
export type { PushDelivery, PushSender } from './ports/push.port';
export { PUSH_SENDER } from './ports/push.port';
export type { PushTokenRegistry } from './ports/push-token-registry.port';
export { PUSH_TOKEN_REGISTRY } from './ports/push-token-registry.port';
