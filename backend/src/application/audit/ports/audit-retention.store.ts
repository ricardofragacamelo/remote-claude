import type { AuditPurgeTrigger, AuditTrail } from '@domain/audit';

/** One batch of a purge: which trail, up to when, how many at most, and what to record it as. */
export interface AuditPurgeBatch {
  /** The id of the record this batch writes, when it deletes anything. */
  readonly recordId: string;

  /** The run the batch belongs to — what groups the batches of one purge. */
  readonly purgeId: string;

  readonly triggeredBy: AuditPurgeTrigger;
  readonly trail: AuditTrail;
  readonly retentionDays: number;

  /** Rows with `at` strictly before this instant are outside the window. */
  readonly cutoff: Date;

  readonly limit: number;

  /** When the batch ran. */
  readonly at: Date;
}

/** The purge's hold on the trail, for as long as it holds the lock. */
export interface AuditRetentionSession {
  /**
   * Deletes up to `limit` rows outside the window and records the batch — in **one** statement, so
   * either both happen or neither does. A batch that deleted nothing records nothing
   * ([D-19](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
   *
   * @returns how many rows it deleted
   */
  purgeBatch(batch: AuditPurgeBatch): Promise<number>;
}

/** What {@link AuditRetentionStore.exclusively} came back with. */
export type Exclusive<T> =
  { readonly acquired: true; readonly value: T } | { readonly acquired: false };

/**
 * How the trail is cut back to its window.
 *
 * A port of its own, and neither {@link import('./audit.repository').AuditRepository} nor the
 * reader: those two are the write and the read of the flow, and a flow that could delete from the
 * trail is the flow the append-only rule exists to prevent. This one is wired into the purge and
 * into nothing else.
 */
export interface AuditRetentionStore {
  /**
   * Runs `work` holding the purge lock, or does not run it at all when another purge holds it.
   *
   * The lock is what keeps the job and the command from purging the same window at the same
   * moment — the recipe for the lost batch S-37 forbids. Never waiting for it is deliberate: the
   * second purge has nothing to do that the first is not already doing (S-51).
   */
  exclusively<T>(work: (session: AuditRetentionSession) => Promise<T>): Promise<Exclusive<T>>;
}

export const AUDIT_RETENTION_STORE = Symbol('AuditRetentionStore');
