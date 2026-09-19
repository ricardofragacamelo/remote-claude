import { AuditEntry, ToolInput } from '@domain/audit';
import type { AuditDecision } from '@domain/audit';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import type { auditEntries } from '@infra/database/schema';

type AuditRow = typeof auditEntries.$inferSelect;
type AuditInsert = typeof auditEntries.$inferInsert;

/** Translation between the table and the entity. The two change for different reasons. */
export function toEntity(row: AuditRow): AuditEntry {
  return AuditEntry.restore({
    id: row.id,
    userId: UserId.create(row.userId),
    sessionId: SessionId.create(row.sessionId),
    toolUseId: row.toolUseId,
    toolName: row.toolName,
    input: ToolInput.restore(JSON.stringify(row.input)),
    decision: row.decision as AuditDecision,
    origin: { deviceId: row.deviceId, ip: row.ip },
    at: row.at,
  });
}

/**
 * The row an entry should be written as.
 *
 * There is no `toUpdate` here, and there never will be: the table's trigger aborts `UPDATE`, so
 * such a function would produce SQL that cannot run.
 */
export function toRow(entry: AuditEntry): AuditInsert {
  const snapshot = entry.snapshot();

  return {
    id: snapshot.id,
    userId: snapshot.userId.value,
    sessionId: snapshot.sessionId.value,
    toolUseId: snapshot.toolUseId,
    toolName: snapshot.toolName,
    // The exact input, whole. Truncation belongs to the log, never to the trail.
    input: snapshot.input.value,
    decision: snapshot.decision,
    deviceId: snapshot.origin.deviceId,
    ip: snapshot.origin.ip,
    at: snapshot.at,
  };
}
