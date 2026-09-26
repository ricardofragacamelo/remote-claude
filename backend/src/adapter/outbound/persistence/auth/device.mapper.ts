import { Device, DeviceLocale, UserId, isDevicePlatform, isDeviceStatus } from '@domain/auth';
import type { devices } from '@infra/database/schema';

type DeviceRow = typeof devices.$inferSelect;
type DeviceInsert = typeof devices.$inferInsert;

/**
 * A value the table's CHECK constraint says cannot be there, and which is.
 *
 * It is thrown rather than defaulted: a row whose status the code does not understand is a schema
 * ahead of this build, and guessing which of the three it meant is how a revoked device comes back
 * as pending.
 */
export class UnreadableDeviceRowError extends Error {
  constructor(column: string, value: string) {
    super(`devices.${column} holds ${JSON.stringify(value)}, which this build does not know`);
    this.name = 'UnreadableDeviceRowError';
  }
}

/** Translation between the table and the entity. The two change for different reasons. */
export function toEntity(row: DeviceRow): Device {
  if (!isDeviceStatus(row.status)) {
    throw new UnreadableDeviceRowError('status', row.status);
  }
  if (!isDevicePlatform(row.platform)) {
    throw new UnreadableDeviceRowError('platform', row.platform);
  }

  return Device.restore({
    id: row.id,
    userId: UserId.create(row.userId),
    installId: row.installId,
    name: row.name,
    platform: row.platform,
    appVersion: row.appVersion,
    pushToken: row.pushToken,
    locale: DeviceLocale.create(row.locale),
    status: row.status,
    registeredAt: row.registeredAt,
    lastSeenAt: row.lastSeenAt,
    approvedAt: row.approvedAt,
    revokedAt: row.revokedAt,
  });
}

/** The row an entity should be written as. `updatedAt` is set here, never left to a trigger. */
export function toRow(device: Device, now: Date): DeviceInsert {
  const snapshot = device.snapshot();

  return {
    id: snapshot.id,
    userId: snapshot.userId.value,
    installId: snapshot.installId,
    name: snapshot.name,
    platform: snapshot.platform,
    appVersion: snapshot.appVersion,
    pushToken: snapshot.pushToken,
    locale: snapshot.locale.value,
    status: snapshot.status,
    registeredAt: snapshot.registeredAt,
    lastSeenAt: snapshot.lastSeenAt,
    approvedAt: snapshot.approvedAt,
    revokedAt: snapshot.revokedAt,
    updatedAt: now,
  };
}
