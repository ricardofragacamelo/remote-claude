import type { AuditEventRepository } from '@application/audit';
import type { AuditEvent } from '@domain/audit';

/** The trail of account events, kept in order, so a test can say what reached it. */
export class RecordingAuditEvents implements AuditEventRepository {
  readonly appended: AuditEvent[] = [];

  /** When set, every append fails with it — the path where the trail is unavailable. */
  failure: Error | null = null;

  append(event: AuditEvent): Promise<void> {
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }

    this.appended.push(event);
    return Promise.resolve();
  }

  /** The kinds recorded, in order. The assertion most specs actually want. */
  get kinds(): readonly string[] {
    return this.appended.map((event) => event.kind);
  }
}
