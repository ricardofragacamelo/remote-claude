import type { Device, UserId } from '@domain/auth';

/**
 * How devices are stored and read back.
 *
 * It answers entities, never rows, and every lookup is scoped by user — not as a convention but
 * because the unique key of a device **is** `(userId, installId)`: an unscoped `findByInstallId`
 * would be the query that hands one person's phone to another (D-10).
 */
export interface DeviceRepository {
  /** The one device of this user with that installation id, or nothing. */
  findByInstallId(userId: UserId, installId: string): Promise<Device | null>;

  /** One device of this user by our id. A device of somebody else answers nothing (S-06). */
  findById(userId: UserId, deviceId: string): Promise<Device | null>;

  /** Every device of this user, most recently seen first. */
  findByUser(userId: UserId): Promise<readonly Device[]>;

  /** Every approved device of this user — who a push goes to (D-04). */
  findApprovedByUser(userId: UserId): Promise<readonly Device[]>;

  /** Writes a device, whether it is new or a registration arriving again. */
  save(device: Device): Promise<void>;

  /**
   * Removes the pending registrations older than `registeredBefore`.
   *
   * @returns the devices it removed, so each one can reach the trail. Running it a second time
   *   removes nothing and returns an empty list, which is what makes the sweep idempotent (S-60).
   */
  deleteExpiredPending(registeredBefore: Date): Promise<readonly Device[]>;
}

export const DEVICE_REPOSITORY = Symbol('DeviceRepository');
