import { AuditEvent, isAuditEventKind } from '@domain/audit';
import { UserId } from '@domain/auth';
import type { auditEvents } from '@infra/database/schema';

type AuditEventRow = typeof auditEvents.$inferSelect;
type AuditEventInsert = typeof auditEvents.$inferInsert;

/** A kind the table's CHECK constraint says cannot be there, and which is. */
export class UnreadableAuditEventRowError extends Error {
  constructor(value: string) {
    super(`audit_events.kind holds ${JSON.stringify(value)}, which this build does not know`);
    this.name = 'UnreadableAuditEventRowError';
  }
}

/** Translation between the table and the entity. */
export function toEntity(row: AuditEventRow): AuditEvent {
  if (!isAuditEventKind(row.kind)) {
    throw new UnreadableAuditEventRowError(row.kind);
  }

  return AuditEvent.restore({
    id: row.id,
    userId: UserId.create(row.userId),
    kind: row.kind,
    subjectId: row.subjectId,
    subjectLabel: row.subjectLabel,
    at: row.at,
  });
}

/** The row an entity should be written as. There is no `updatedAt`: the table refuses updates. */
export function toRow(event: AuditEvent): AuditEventInsert {
  return {
    id: event.id,
    userId: event.userId.value,
    kind: event.kind,
    subjectId: event.subjectId,
    subjectLabel: event.subjectLabel,
    at: event.at,
  };
}
