import type { AuditEvent } from '@domain/audit';

/**
 * How the trail of account events is written.
 *
 * Write only, for the same reason as {@link import('./audit.repository').AuditRepository}: `audit`
 * is write-only to every other module. There is no `update` and no `delete` because the table's
 * own trigger aborts both, so either method would be an operation that cannot succeed.
 */
export interface AuditEventRepository {
  append(event: AuditEvent): Promise<void>;
}

export const AUDIT_EVENT_REPOSITORY = Symbol('AuditEventRepository');
