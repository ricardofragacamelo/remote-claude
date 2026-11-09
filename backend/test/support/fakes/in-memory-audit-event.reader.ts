import type { AuditEventPage, AuditEventPageRequest, AuditEventReader } from '@application/audit';
import type { AuditEvent } from '@domain/audit';

/** `audit_events`, in a list — enough of its filters to test a reader of it. */
export class InMemoryAuditEventReader implements AuditEventReader {
  readonly rows: { seq: number; event: AuditEvent }[] = [];

  page(request: AuditEventPageRequest): Promise<AuditEventPage> {
    const matching = this.rows
      .filter(
        (row) =>
          row.event.userId.equals(request.userId) &&
          (request.kindPrefix === null || row.event.kind.startsWith(request.kindPrefix)) &&
          (request.subjectId === undefined ||
            request.subjectId === null ||
            row.event.subjectId === request.subjectId) &&
          (request.before === null || row.seq < request.before),
      )
      .sort((a, b) => b.seq - a.seq);

    const kept = matching.slice(0, request.limit);
    const hasMore = matching.length > request.limit;

    return Promise.resolve({
      records: kept.map((row) => ({ seq: row.seq, event: row.event })),
      nextCursor: hasMore ? (kept.at(-1)?.seq ?? null) : null,
    });
  }
}
