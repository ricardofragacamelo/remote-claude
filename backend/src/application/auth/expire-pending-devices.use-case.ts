import { PENDING_DEVICE_TTL_MS } from '@domain/auth';
import type { DeviceContext } from './device-context';

/**
 * The sweep that takes forgotten registrations out of the list.
 *
 * Seven days, and the reason is not tidiness: a long list of pending devices is how the wrong one
 * gets approved out of fatigue, months later. Registering again is opening the app
 * ([D-11](../../../../docs/plans/02-mobile-approval/decisions.md#d-11--o-pendente-esquecido)).
 *
 * Idempotent by construction — the second run finds nothing to remove and returns zero — and it
 * touches nothing but `pending`: an approved device is not forgotten just because nobody has
 * opened it this week, and a revoked one stays as the record that it was revoked.
 */
export class ExpirePendingDevicesUseCase {
  constructor(
    private readonly context: DeviceContext,
    private readonly ttlMs: number = PENDING_DEVICE_TTL_MS,
  ) {}

  /** @returns how many registrations it removed */
  async execute(): Promise<number> {
    const at = this.context.clock.now();
    const expired = await this.context.devices.deleteExpiredPending(
      new Date(at.getTime() - this.ttlMs),
    );

    for (const device of expired) {
      await this.context.trail.execute({
        userId: device.userId,
        kind: 'device.expired',
        subjectId: device.id,
        subjectLabel: device.snapshot().name,
        at,
      });
    }

    return expired.length;
  }
}
