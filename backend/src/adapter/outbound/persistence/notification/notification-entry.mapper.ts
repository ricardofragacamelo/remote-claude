import { UserId } from '@domain/auth';
import { NOTIFICATION_SEVERITIES, NotificationEntry } from '@domain/notification';
import type { NotificationSeverity } from '@domain/notification';
import type { notifications } from '@infra/database/schema';

type NotificationRow = typeof notifications.$inferSelect;
type NotificationInsert = typeof notifications.$inferInsert;

/**
 * Translation between the table and the entity. The two change for different reasons.
 *
 * A severity the domain does not know cannot be in the table — a `CHECK` keeps it out — and if one
 * ever were, reading it as `error` is the reading that hides nothing.
 */
export function toEntity(row: NotificationRow): NotificationEntry {
  return NotificationEntry.restore({
    id: row.id,
    userId: UserId.create(row.userId),
    clientId: row.clientId,
    severity: isSeverity(row.severity) ? row.severity : 'error',
    messageKey: row.messageKey,
    params: row.params,
    count: row.count,
    createdAt: row.createdAt,
    readAt: row.readAt,
  });
}

/** The row a new entry is written as. `updatedAt` is set here, never left to a trigger. */
export function toRow(entry: NotificationEntry, now: Date): NotificationInsert {
  const snapshot = entry.snapshot();

  return {
    id: snapshot.id,
    userId: snapshot.userId.value,
    clientId: snapshot.clientId,
    severity: snapshot.severity,
    messageKey: snapshot.messageKey,
    params: { ...snapshot.params },
    count: snapshot.count,
    createdAt: snapshot.createdAt,
    readAt: snapshot.readAt,
    updatedAt: now,
  };
}

function isSeverity(value: string): value is NotificationSeverity {
  return (NOTIFICATION_SEVERITIES as readonly string[]).includes(value);
}
