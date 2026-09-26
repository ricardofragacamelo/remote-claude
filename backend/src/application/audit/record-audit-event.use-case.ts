import { AuditEvent } from '@domain/audit';
import type { AuditEventDraft } from '@domain/audit';
import type { IdGenerator } from '@domain/shared';
import type { AuditEventRepository } from './ports/audit-event.repository';

/** Everything an event carries except its id, which this use case mints. */
export type RecordAuditEventCommand = Omit<AuditEventDraft, 'id'>;

/**
 * Writes one account event to the trail.
 *
 * Unlike a tool invocation, a failure here is **not** graded: it propagates, and the operation
 * that caused it fails with it. The graded treatment exists so that a blip of the database cannot
 * cost somebody their session; approving a device is a single deliberate click, and answering
 * "done" for an approval nobody can account for afterwards is the worse of the two outcomes.
 */
export class RecordAuditEventUseCase {
  constructor(
    private readonly events: AuditEventRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: RecordAuditEventCommand): Promise<void> {
    await this.events.append(AuditEvent.record({ ...command, id: this.ids.next() }));
  }
}
