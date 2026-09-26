/** Public surface of the `audit` domain. Another domain imports this file, never a deep path. */
export { AuditEntry } from './entities/audit-entry.entity';
export type {
  AuditDecision,
  AuditEntryDraft,
  AuditEntrySnapshot,
  AuditOrigin,
  AuditVerdict,
} from './entities/audit-entry.entity';
export { AUDIT_DECISIONS, isAuditDecision } from './entities/audit-entry.entity';
export { disclosedInput } from './services/disclosed-input';
export { AuditTrailForbiddenError } from './errors/audit-trail-forbidden.error';
export { AuditEvent } from './entities/audit-event.entity';
export type { AuditEventDraft } from './entities/audit-event.entity';
export { AUDIT_EVENT_KINDS, isAuditEventKind } from './value-objects/audit-event-kind.value-object';
export type { AuditEventKind } from './value-objects/audit-event-kind.value-object';
export { ToolInput } from './value-objects/tool-input.value-object';
export { AuditUnavailableError } from './errors/audit-unavailable.error';
export {
  AUDIT_PURGE_TRIGGERS,
  AUDIT_RETENTION_FLOOR_DAYS,
  AUDIT_TRAILS,
  retentionCutoff,
} from './value-objects/retention.value-object';
export type { AuditPurgeTrigger, AuditTrail } from './value-objects/retention.value-object';
