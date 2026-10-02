import type {
  AuditEventPage,
  AuditEventPageRequest,
  AuditEventReader,
} from './ports/audit-event.reader';

/**
 * "What did I do to my account and my files?" — one page of the answer (plan 07, B-17).
 *
 * Scoped by who asks, always: there is no request that reaches another person's facts, so there is
 * no `403` to give — a person with none gets an empty page (S-121). Newest first, by `seq`, so a fact
 * written while somebody pages lands above the window already read, never inside it (S-123).
 */
export class QueryAuditEventsUseCase {
  constructor(private readonly events: AuditEventReader) {}

  execute(request: AuditEventPageRequest): Promise<AuditEventPage> {
    return this.events.page(request);
  }
}
