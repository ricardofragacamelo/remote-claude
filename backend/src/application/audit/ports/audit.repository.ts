import type { AuditEntry } from '@domain/audit';

/**
 * How the trail is written.
 *
 * Write only, and that is the whole interface on purpose: `audit` is write-only to every other
 * module — everybody writes, nobody reads from inside the flow
 * (docs/architecture/backend/03-modules.md). Reading it back is a query of a later plan, and it
 * will not arrive through this port.
 *
 * There is no `update` and no `delete`, and the absence is structural rather than polite: the
 * table's own trigger aborts both, so a method here would be an operation that cannot succeed.
 */
export interface AuditRepository {
  append(entry: AuditEntry): Promise<void>;
}

export const AUDIT_REPOSITORY = Symbol('AuditRepository');
