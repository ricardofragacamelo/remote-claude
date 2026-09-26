import { z } from 'zod';

import { DEVICE_LOCALES, DEVICE_PLATFORMS } from '@domain/auth';
import type { Device } from '@domain/auth';

/**
 * What `POST /devices` is sent.
 *
 * It mirrors `packages/contracts/schema/commands/device-register.schema.json`, which is the shared
 * contract the app generates its Dart from. The schema is the source of truth for the **shape**;
 * this is the validation at the edge, and the two are checked against each other by the payload
 * type the generated package exports.
 */
export const registerDeviceSchema = z.object({
  installId: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  platform: z.enum(DEVICE_PLATFORMS),
  appVersion: z.string().min(1).max(50),
  /** Absent is normal: the device still watches sessions, it just gets no push (S-12). */
  pushToken: z.string().min(1).max(4096).optional(),
  /** Absent falls back to `en` in the domain, so it is optional here rather than defaulted. */
  locale: z.enum(DEVICE_LOCALES).optional(),
});

export type RegisterDeviceBody = z.infer<typeof registerDeviceSchema>;

/**
 * One device, as the client sees it.
 *
 * **The push token never crosses.** Not truncated, not hashed, not the last six characters: the
 * screen that lists devices has no use for it, and a value that is in a response is a value that
 * is in a browser's network tab and in whatever is proxying.
 */
export interface DeviceDto {
  readonly id: string;
  readonly name: string;
  readonly platform: string;
  readonly appVersion: string;
  readonly locale: string;
  readonly status: string;
  /** Whether this device has a push token at all — which is what the screen can act on. */
  readonly pushEnabled: boolean;
  readonly registeredAt: string;
  readonly lastSeenAt: string;
  readonly approvedAt: string | null;
  readonly revokedAt: string | null;
}

/** The listing. An object and not a bare array, so the response can grow a field later. */
export interface DeviceListDto {
  readonly devices: readonly DeviceDto[];
}

/** The transport shape of a device. */
export function toDeviceDto(device: Device): DeviceDto {
  const snapshot = device.snapshot();

  return {
    id: snapshot.id,
    name: snapshot.name,
    platform: snapshot.platform,
    appVersion: snapshot.appVersion,
    locale: snapshot.locale.value,
    status: snapshot.status,
    pushEnabled: snapshot.pushToken !== null,
    registeredAt: snapshot.registeredAt.toISOString(),
    lastSeenAt: snapshot.lastSeenAt.toISOString(),
    approvedAt: snapshot.approvedAt?.toISOString() ?? null,
    revokedAt: snapshot.revokedAt?.toISOString() ?? null,
  };
}
