import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNull, lt } from 'drizzle-orm';

import type {
  NotificationHistoryRepository,
  NotificationPage,
  RecordedNotification,
} from '@application/notification';
import type { UserId } from '@domain/auth';
import type { NotificationEntry } from '@domain/notification';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { notifications } from '@infra/database/schema';
import { lockForTransaction } from '../advisory-lock';
import { runLogged } from '../query-logging';
import { toEntity, toRow } from './notification-entry.mapper';

/**
 * `notifications`, in PostgreSQL.
 *
 * Every statement carries the owner in its predicate — an id alone never reaches a row — and the
 * recording runs behind an advisory lock on the user, so the ceiling is kept by the transaction
 * that passes it: two entries recorded at once, with the user already at two hundred, still leave
 * two hundred (plan 06, S-176).
 *
 * The cursor is the `seq` of the last entry of a page, written out as a number: opaque to the
 * client, which only hands it back.
 */
@Injectable()
export class DrizzleNotificationHistoryRepository implements NotificationHistoryRepository {
  constructor(@Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext) {}

  async record(entry: NotificationEntry, limit: number): Promise<RecordedNotification> {
    const owner = entry.userId.value;

    return this.context.db.transaction(async (tx) => {
      await lockForTransaction(tx, this.context.logger, 'notification.lock', [
        'notifications',
        owner,
      ]);

      const [existing] = await runLogged(
        this.context.logger,
        'notification.findByClientId',
        tx
          .select()
          .from(notifications)
          .where(and(eq(notifications.userId, owner), eq(notifications.clientId, entry.clientId)))
          .limit(1),
      );

      if (existing !== undefined) {
        return { entry: toEntity(existing), created: false };
      }

      await runLogged(
        this.context.logger,
        'notification.insert',
        tx.insert(notifications).values(toRow(entry, this.context.clock.now())),
      );

      // Everything past the newest `limit` of this user goes, in the transaction that passed it.
      await runLogged(
        this.context.logger,
        'notification.trim',
        tx
          .delete(notifications)
          .where(
            and(
              eq(notifications.userId, owner),
              inArray(
                notifications.seq,
                tx
                  .select({ seq: notifications.seq })
                  .from(notifications)
                  .where(eq(notifications.userId, owner))
                  .orderBy(desc(notifications.seq))
                  .offset(limit),
              ),
            ),
          ),
      );

      return { entry, created: true };
    });
  }

  async page(userId: UserId, cursor: string | null, size: number): Promise<NotificationPage> {
    const owner = eq(notifications.userId, userId.value);
    const rows = await runLogged(
      this.context.logger,
      'notification.page',
      this.context.db
        .select()
        .from(notifications)
        .where(cursor === null ? owner : and(owner, lt(notifications.seq, Number(cursor))))
        .orderBy(desc(notifications.seq))
        .limit(size + 1),
    );
    const unread = await runLogged(
      this.context.logger,
      'notification.countUnread',
      this.context.db
        .select({ value: count() })
        .from(notifications)
        .where(and(owner, isNull(notifications.readAt))),
    );
    const shown = rows.slice(0, size);
    const last = shown.at(-1);

    return {
      entries: shown.map(toEntity),
      nextCursor: rows.length > size && last !== undefined ? String(last.seq) : null,
      // An aggregate answers exactly one row; summing it reads that row without assuming it.
      unread: unread.reduce((total, row) => total + row.value, 0),
    };
  }

  async markRead(userId: UserId, ids: readonly string[], at: Date): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await runLogged(
      this.context.logger,
      'notification.markRead',
      this.context.db
        .update(notifications)
        .set({ readAt: at, updatedAt: this.context.clock.now() })
        .where(
          and(
            eq(notifications.userId, userId.value),
            inArray(notifications.id, [...ids]),
            isNull(notifications.readAt),
          ),
        ),
    );
  }

  async markAllRead(userId: UserId, at: Date): Promise<void> {
    await runLogged(
      this.context.logger,
      'notification.markAllRead',
      this.context.db
        .update(notifications)
        .set({ readAt: at, updatedAt: this.context.clock.now() })
        .where(and(eq(notifications.userId, userId.value), isNull(notifications.readAt))),
    );
  }

  async remove(userId: UserId, id: string): Promise<void> {
    await runLogged(
      this.context.logger,
      'notification.remove',
      this.context.db
        .delete(notifications)
        .where(and(eq(notifications.userId, userId.value), eq(notifications.id, id))),
    );
  }

  async clear(userId: UserId): Promise<void> {
    await runLogged(
      this.context.logger,
      'notification.clear',
      this.context.db.delete(notifications).where(eq(notifications.userId, userId.value)),
    );
  }

  async purgeCreatedBefore(cutoff: Date): Promise<number> {
    const removed = await runLogged(
      this.context.logger,
      'notification.purge',
      this.context.db
        .delete(notifications)
        .where(lt(notifications.createdAt, cutoff))
        .returning({ id: notifications.id }),
    );

    return removed.length;
  }
}
