/**
 * Where a device is in its life.
 *
 * `pending` watches and does not decide; `approved` decides; `revoked` does neither and is
 * terminal. A pending registration nobody ever approved is removed rather than given a fourth
 * state — see docs/plans/02-mobile-approval/decisions.md#d-11--o-pendente-esquecido.
 */
export const DEVICE_STATUSES = ['pending', 'approved', 'revoked'] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

/** The operating systems the app is built for. Only Android is exercised in this plan (D-12). */
export const DEVICE_PLATFORMS = ['android', 'ios'] as const;

export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

/** Whether `value` is a status this build knows. Used where a row is read back. */
export function isDeviceStatus(value: string): value is DeviceStatus {
  return (DEVICE_STATUSES as readonly string[]).includes(value);
}

/** Whether `value` is a platform this build knows. Used where a row is read back. */
export function isDevicePlatform(value: string): value is DevicePlatform {
  return (DEVICE_PLATFORMS as readonly string[]).includes(value);
}
