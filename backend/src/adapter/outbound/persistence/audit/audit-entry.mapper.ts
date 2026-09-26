import { AuditEntry, ToolInput } from '@domain/audit';
import type { AuditDecision, AuditVerdict } from '@domain/audit';
import { UserId } from '@domain/auth';
import type { PermissionOrigin, PermissionScope } from '@domain/permission';
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
    verdict: verdictOf(row),
  });
}

/**
 * The verdict a row carries, or `null`.
 *
 * `null` on every `recorded` row — the hook decides nothing — and also on a decision row written
 * before the verdict had columns to go in. Those are read as they are, without a verdict, rather
 * than given one reconstructed from somewhere else: an entry of the trail says what it said.
 */
function verdictOf(row: AuditRow): AuditVerdict | null {
  if (row.requestId === null) {
    return null;
  }

  return {
    requestId: row.requestId,
    auto: row.auto === true,
    ruleId: row.ruleId,
    scope: row.scope as PermissionScope,
    resolvedBy: row.resolvedBy === null ? null : UserId.create(row.resolvedBy),
    resolvedFrom: row.resolvedFrom as PermissionOrigin | null,
  };
}

/**
 * The row an entry should be written as.
 *
 * There is no `toUpdate` here, and there never will be: the table's trigger aborts `UPDATE`, so
 * such a function would produce SQL that cannot run.
 *
 * @param traceId the trace in scope at the write, which the repository reads from the context —
 *   the entity does not carry one, because the domain does not know what a trace is
 */
export function toRow(entry: AuditEntry, traceId: string | null): AuditInsert {
  const snapshot = entry.snapshot();
  const verdict = snapshot.verdict;

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
    traceId,
    requestId: verdict?.requestId ?? null,
    auto: verdict?.auto ?? null,
    ruleId: verdict?.ruleId ?? null,
    scope: verdict?.scope ?? null,
    resolvedBy: verdict?.resolvedBy?.value ?? null,
    resolvedFrom: verdict?.resolvedFrom ?? null,
    at: snapshot.at,
  };
}
