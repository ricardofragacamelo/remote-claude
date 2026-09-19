/** Public surface of the `audit` domain. Another domain imports this file, never a deep path. */
export { AuditEntry } from './entities/audit-entry.entity';
export type {
  AuditDecision,
  AuditEntryDraft,
  AuditEntrySnapshot,
  AuditOrigin,
} from './entities/audit-entry.entity';
export { ToolInput } from './value-objects/tool-input.value-object';
export { AuditUnavailableError } from './errors/audit-unavailable.error';
