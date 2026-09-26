import { AUDIT_TRAILS, retentionCutoff } from '@domain/audit';
import type { AuditPurgeTrigger, AuditTrail } from '@domain/audit';
import type { Clock, IdGenerator } from '@domain/shared';
import type { AuditRetentionSession, AuditRetentionStore } from './ports/audit-retention.store';

/**
 * How many rows one batch deletes.
 *
 * Small enough that a batch holds its row locks for milliseconds — the trail keeps being written
 * while the purge runs, and a write that waited on the purge would hold up an authorisation
 * (S-38). Large enough that the record of the purge grows by one row per thousand it removes.
 */
export const AUDIT_PURGE_BATCH_SIZE = 1_000;

/** How one trail fared. `failure` is what stopped it, and `deleted` is what it removed before. */
export interface AuditTrailPurge {
  readonly trail: AuditTrail;
  readonly deleted: number;
  readonly failure: { readonly error: unknown } | null;
}

/** What a purge did — or, when it did not run, why. */
export type AuditPurgeReport =
  | {
      readonly status: 'completed' | 'failed';
      readonly purgeId: string;
      readonly triggeredBy: AuditPurgeTrigger;
      readonly retentionDays: number;
      readonly cutoff: Date;
      readonly trails: readonly AuditTrailPurge[];
    }
  | {
      readonly status: 'skipped';
      readonly reason: 'alreadyRunning';
      readonly triggeredBy: AuditPurgeTrigger;
      readonly retentionDays: number;
      readonly cutoff: Date;
    };

/** What the purge is configured with. */
export interface AuditPurgeSettings {
  /** The window. At least the floor — the configuration refuses less, and so does the database. */
  readonly retentionDays: number;
  readonly batchSize?: number;
}

/**
 * Cuts the trail back to its retention window.
 *
 * **The same routine for the job and for the command** — a second implementation is the one that
 * ages differently ([D-07](../../../../docs/plans/03-rules-and-audit/decisions.md)). What differs
 * between them is only who started it, and that goes into the record.
 *
 * It deletes by **window**, never by choice: nothing here takes an id or a filter, so whoever can
 * run the purge can decide *when* rows go and never *which*. It deletes in batches, each of them
 * recorded in the statement that deletes it, which is what makes a rerun safe: whatever an
 * interrupted run left behind is exactly what it did not remove (S-37).
 *
 * The two trails are purged one after the other and independently: a batch the database refuses
 * on one does not leave the other growing for a fault that is not its own (S-87). The report says
 * which failed and with what; logging it is the caller's, because this layer does not log.
 */
export class PurgeAuditTrailUseCase {
  private readonly batchSize: number;

  constructor(
    private readonly store: AuditRetentionStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly settings: AuditPurgeSettings,
  ) {
    this.batchSize = settings.batchSize ?? AUDIT_PURGE_BATCH_SIZE;
  }

  get retentionDays(): number {
    return this.settings.retentionDays;
  }

  async execute(triggeredBy: AuditPurgeTrigger): Promise<AuditPurgeReport> {
    const { retentionDays } = this.settings;
    const cutoff = retentionCutoff(this.clock.now(), retentionDays);
    const purgeId = this.ids.next();

    const run = await this.store.exclusively(async (session) => {
      const trails: AuditTrailPurge[] = [];

      for (const trail of AUDIT_TRAILS) {
        trails.push(await this.purgeTrail(session, { purgeId, triggeredBy, trail, cutoff }));
      }

      return trails;
    });

    if (!run.acquired) {
      return { status: 'skipped', reason: 'alreadyRunning', triggeredBy, retentionDays, cutoff };
    }

    return {
      status: run.value.some((trail) => trail.failure !== null) ? 'failed' : 'completed',
      purgeId,
      triggeredBy,
      retentionDays,
      cutoff,
      trails: run.value,
    };
  }

  /** Batch after batch until one comes back short, which is the trail saying it has no more. */
  private async purgeTrail(
    session: AuditRetentionSession,
    run: {
      readonly purgeId: string;
      readonly triggeredBy: AuditPurgeTrigger;
      readonly trail: AuditTrail;
      readonly cutoff: Date;
    },
  ): Promise<AuditTrailPurge> {
    let deleted = 0;

    try {
      for (;;) {
        const removed = await session.purgeBatch({
          ...run,
          recordId: this.ids.next(),
          retentionDays: this.settings.retentionDays,
          limit: this.batchSize,
          at: this.clock.now(),
        });
        deleted += removed;

        if (removed < this.batchSize) {
          return { trail: run.trail, deleted, failure: null };
        }
      }
    } catch (error) {
      // Not swallowed: it goes back in the report, which the job logs at `error` and the command
      // prints before exiting with a non-zero code.
      return { trail: run.trail, deleted, failure: { error } };
    }
  }
}
