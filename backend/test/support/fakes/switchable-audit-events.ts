import type { AuditEventRepository } from '@application/audit';
import type { AuditEvent } from '@domain/audit';

/**
 * The real trail of account facts, with a switch that makes it unavailable — the database gone
 * for one request, and back for the next.
 */
export class SwitchableAuditEvents implements AuditEventRepository {
  /** When set, every append fails with it and nothing reaches the delegate. */
  failure: Error | null = null;

  constructor(private readonly delegate: AuditEventRepository) {}

  append(event: AuditEvent): Promise<void> {
    return this.failure === null ? this.delegate.append(event) : Promise.reject(this.failure);
  }
}
