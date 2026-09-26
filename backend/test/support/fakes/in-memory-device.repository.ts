import type { DeviceRepository } from '@application/auth';
import type { Device, UserId } from '@domain/auth';

/**
 * The devices, in a map.
 *
 * Keyed by the pair `(userId, installId)`, which is the unique key of the table — a fake that
 * allows two rows where the schema allows one is a fake that hides the bug it was meant to catch,
 * and this is precisely the key D-10 exists about.
 */
export class InMemoryDeviceRepository implements DeviceRepository {
  readonly rows = new Map<string, Device>();

  /** How many times `save` was called, so a test can assert that a no-op wrote nothing. */
  saves = 0;

  seed(...devices: readonly Device[]): this {
    for (const device of devices) {
      this.rows.set(key(device.userId, device.installId), device);
    }

    return this;
  }

  findByInstallId(userId: UserId, installId: string): Promise<Device | null> {
    return Promise.resolve(this.rows.get(key(userId, installId)) ?? null);
  }

  findById(userId: UserId, deviceId: string): Promise<Device | null> {
    return Promise.resolve(
      [...this.rows.values()].find(
        (device) => device.id === deviceId && device.userId.equals(userId),
      ) ?? null,
    );
  }

  findByUser(userId: UserId): Promise<readonly Device[]> {
    return Promise.resolve(
      [...this.rows.values()].filter((device) => device.userId.equals(userId)),
    );
  }

  findApprovedByUser(userId: UserId): Promise<readonly Device[]> {
    return Promise.resolve(
      [...this.rows.values()].filter(
        (device) => device.userId.equals(userId) && device.status === 'approved',
      ),
    );
  }

  save(device: Device): Promise<void> {
    this.saves += 1;
    this.rows.set(key(device.userId, device.installId), device);
    return Promise.resolve();
  }

  deleteExpiredPending(registeredBefore: Date): Promise<readonly Device[]> {
    const doomed = [...this.rows.values()].filter(
      (device) => device.status === 'pending' && device.snapshot().registeredAt < registeredBefore,
    );

    for (const device of doomed) {
      this.rows.delete(key(device.userId, device.installId));
    }

    return Promise.resolve(doomed);
  }
}

/** `JSON.stringify` of the pair rather than a separator: an install id may contain anything. */
function key(userId: UserId, installId: string): string {
  return JSON.stringify([userId.value, installId]);
}
