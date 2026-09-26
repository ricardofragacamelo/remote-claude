import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { DeviceRepository } from '@application/auth';
import type { Device, UserId } from '@domain/auth';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { devices } from '@infra/database/schema';
import { runLogged } from '../query-logging';
import { toEntity, toRow } from './device.mapper';

/**
 * `devices`, in PostgreSQL.
 *
 * Every read is scoped by user, and that is structural rather than careful: the unique key of a
 * device is `(user_id, install_id)`, so a query on `install_id` alone would be the one that hands
 * one person's phone to another (D-10).
 */
@Injectable()
export class DrizzleDeviceRepository implements DeviceRepository {
  constructor(@Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext) {}

  async findByInstallId(userId: UserId, installId: string): Promise<Device | null> {
    return this.one('device.findByInstallId', userId, eq(devices.installId, installId));
  }

  async findById(userId: UserId, deviceId: string): Promise<Device | null> {
    return this.one('device.findById', userId, eq(devices.id, deviceId));
  }

  /**
   * One device of one user, by whatever else identifies it.
   *
   * The user is not a parameter of the caller's choosing: it is always in the predicate, because
   * the unique key of a device **is** `(user_id, install_id)`. A lookup that could be written
   * without it would be the one that hands one person's phone to another (D-10).
   */
  private async one(op: string, userId: UserId, matches: SQL): Promise<Device | null> {
    const rows = await runLogged(
      this.context.logger,
      op,
      this.context.db
        .select()
        .from(devices)
        .where(and(eq(devices.userId, userId.value), matches))
        .limit(1),
    );

    return rows[0] === undefined ? null : toEntity(rows[0]);
  }

  async findByUser(userId: UserId): Promise<readonly Device[]> {
    const rows = await runLogged(
      this.context.logger,
      'device.findByUser',
      this.context.db
        .select()
        .from(devices)
        .where(eq(devices.userId, userId.value))
        .orderBy(desc(devices.lastSeenAt)),
    );

    return rows.map(toEntity);
  }

  async findApprovedByUser(userId: UserId): Promise<readonly Device[]> {
    const rows = await runLogged(
      this.context.logger,
      'device.findApprovedByUser',
      this.context.db
        .select()
        .from(devices)
        .where(and(eq(devices.userId, userId.value), eq(devices.status, 'approved')))
        .orderBy(desc(devices.lastSeenAt)),
    );

    return rows.map(toEntity);
  }

  async save(device: Device): Promise<void> {
    const row = toRow(device, this.context.clock.now());

    // The conflict target is the composite unique key, which *is* the identity of the record: the
    // same installation registering again moves a row rather than adding one (S-02), and the same
    // installation of another user still gets its own (S-59).
    await runLogged(
      this.context.logger,
      'device.save',
      this.context.db
        .insert(devices)
        .values(row)
        .onConflictDoUpdate({
          target: [devices.userId, devices.installId],
          set: {
            name: row.name,
            platform: row.platform,
            appVersion: row.appVersion,
            pushToken: row.pushToken,
            locale: row.locale,
            status: row.status,
            lastSeenAt: row.lastSeenAt,
            approvedAt: row.approvedAt,
            revokedAt: row.revokedAt,
            updatedAt: row.updatedAt,
          },
        }),
    );
  }

  async deleteExpiredPending(registeredBefore: Date): Promise<readonly Device[]> {
    // `RETURNING` rather than select-then-delete: two statements would let a device be approved
    // between them, and the sweep would report having removed one that is now approved.
    const rows = await runLogged(
      this.context.logger,
      'device.deleteExpiredPending',
      this.context.db
        .delete(devices)
        .where(and(eq(devices.status, 'pending'), lt(devices.registeredAt, registeredBefore)))
        .returning(),
    );

    return rows.map(toEntity);
  }
}
