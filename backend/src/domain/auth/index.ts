/** Public surface of the `auth` domain. */
export { UserId } from './value-objects/user-id.value-object';
export { Device, PENDING_DEVICE_TTL_MS } from './entities/device.entity';
export type { DeviceRefresh, DeviceRegistration, DeviceSnapshot } from './entities/device.entity';
export {
  DeviceLocale,
  DEVICE_LOCALES,
  FALLBACK_DEVICE_LOCALE,
} from './value-objects/device-locale.value-object';
export type { DeviceLocaleValue } from './value-objects/device-locale.value-object';
export {
  DEVICE_PLATFORMS,
  DEVICE_STATUSES,
  isDevicePlatform,
  isDeviceStatus,
} from './value-objects/device-status.value-object';
export type { DevicePlatform, DeviceStatus } from './value-objects/device-status.value-object';
export { DeviceApprovalForbiddenError } from './errors/device-approval-forbidden.error';
export { DeviceNotFoundError } from './errors/device-not-found.error';
export { DeviceNotRegisteredError } from './errors/device-not-registered.error';
export { DeviceRevokedError } from './errors/device-revoked.error';
export { InvalidUserIdError } from './errors/invalid-user-id.error';
export { TokenExpiredError } from './errors/token-expired.error';
export { UnauthenticatedError } from './errors/unauthenticated.error';
