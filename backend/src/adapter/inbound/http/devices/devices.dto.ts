import { z } from 'zod';

import type { DevicePayload } from '@remote-claude/contracts';

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

/** The transport shape of a device. */
export function toDeviceDto(device: Device): DevicePayload {
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
