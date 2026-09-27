import { Device, UserId } from '@domain/auth';
import type { DevicePlatform } from '@domain/auth';

/** The user every device in a test belongs to, unless the test says otherwise. */
export const deviceOwner = UserId.create('auth|owner');

/** The instant a device is registered at, unless the test says otherwise. */
export const registeredAt = new Date('2026-09-18T10:00:00.000Z');

/** What a test wants to vary about a device, with everything else defaulted. */
export interface DeviceOptions {
  readonly id?: string;
  readonly userId?: UserId;
  readonly installId?: string;
  readonly name?: string;
  readonly platform?: DevicePlatform;
  readonly appVersion?: string;
  readonly pushToken?: string | null;
  readonly locale?: string | null;
  readonly at?: Date;
}

/**
 * A freshly registered device: pending, which is where every device starts.
 *
 * One builder rather than the same nine-field literal in every spec: a field added to
 * `DeviceRegistration` would otherwise be a compile error in as many files as there are specs.
 */
export function aDevice(options: DeviceOptions = {}): Device {
  return Device.register({
    id: given(options.id, 'dev_1'),
    userId: given(options.userId, deviceOwner),
    installId: given(options.installId, 'install-1'),
    name: given(options.name, 'Pixel 8'),
    platform: given(options.platform, 'android'),
    appVersion: given(options.appVersion, '1.0.0'),
    pushToken: given(options.pushToken, 'push-token-abcdef'),
    locale: given(options.locale, 'pt-BR'),
    at: given(options.at, registeredAt),
  });
}

/**
 * What the test asked for, or the default when it asked for nothing.
 *
 * Only `undefined` falls back: an explicit `null` — a device with no push token, or no locale — is
 * something a test asks for, and it has to reach the entity as it was given.
 */
function given<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

/** A device somebody has already approved. */
export function anApprovedDevice(options: DeviceOptions = {}): Device {
  return aDevice(options).approve(options.at ?? registeredAt);
}

/** A device somebody has revoked. */
export function aRevokedDevice(options: DeviceOptions = {}): Device {
  return anApprovedDevice(options).revoke(options.at ?? registeredAt);
}
