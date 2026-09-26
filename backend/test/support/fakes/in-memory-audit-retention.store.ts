import type {
  AuditPurgeBatch,
  AuditRetentionSession,
  AuditRetentionStore,
  Exclusive,
} from '@application/audit';
import type { AuditTrail } from '@domain/audit';

/** A refusal the test arranges: on this trail, once this many batches have gone. */
export interface ArrangedRefusal {
  readonly trail: AuditTrail;
  readonly afterBatches: number;
  readonly error: unknown;
}

/**
 * The trail as a list of instants per table, and the lock as a flag.
 *
 * It behaves like the real store where the use case depends on it — a batch removes the oldest
 * rows strictly before the cutoff, at most `limit` of them, and a batch that removes nothing records
 * nothing — so the use case's loop is tested against the contract, not against a script.
 */
export class InMemoryAuditRetentionStore implements AuditRetentionStore {
  readonly rows: Record<AuditTrail, Date[]> = { entries: [], events: [] };

  /** Every batch that deleted something, as it would have been recorded. */
  readonly recorded: AuditPurgeBatch[] = [];

  /** Every batch asked for, whatever it did. */
  readonly asked: AuditPurgeBatch[] = [];

  /** Another purge holds the lock. */
  held = false;

  refusal: ArrangedRefusal | null = null;

  seed(trail: AuditTrail, ...instants: Date[]): void {
    this.rows[trail].push(...instants);
  }

  async exclusively<T>(
    work: (session: AuditRetentionSession) => Promise<T>,
  ): Promise<Exclusive<T>> {
    if (this.held) {
      return { acquired: false };
    }

    this.held = true;
    try {
      return { acquired: true, value: await work({ purgeBatch: (batch) => this.batch(batch) }) };
    } finally {
      this.held = false;
    }
  }

  private batch(batch: AuditPurgeBatch): Promise<number> {
    this.asked.push(batch);

    const done = this.recorded.filter((recorded) => recorded.trail === batch.trail).length;
    if (this.refusal?.trail === batch.trail && done >= this.refusal.afterBatches) {
      return Promise.reject(this.refusal.error);
    }

    const rows = this.rows[batch.trail].sort((a, b) => a.getTime() - b.getTime());
    const doomed = rows.filter((at) => at < batch.cutoff).slice(0, batch.limit);
    this.rows[batch.trail] = rows.filter((at) => !doomed.includes(at));

    if (doomed.length > 0) {
      this.recorded.push(batch);
    }

    return Promise.resolve(doomed.length);
  }
}
