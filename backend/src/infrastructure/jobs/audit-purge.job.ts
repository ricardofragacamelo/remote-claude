import { Inject, Injectable } from '@nestjs/common';

import { PurgeAuditTrailUseCase } from '@application/audit';
import { SCHEDULER } from '@application/shared';
import type { Scheduler } from '@application/shared';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { summarisePurge } from '../database/audit-purge';
import { PeriodicJob } from './periodic-job';
import type { JobCadence } from './periodic-job';

/**
 * How long after boot the first purge runs.
 *
 * Not at boot, which is already doing database work of its own (the migrations), and not after the
 * whole interval either: with a daily interval, a backend restarted every day would never purge
 * ([D-22](../../../../docs/plans/03-rules-and-audit/decisions.md)).
 */
export const AUDIT_PURGE_FIRST_RUN_DELAY_MS = 60_000;

/** DI token of the job's interval: a number, or `null` when the job is switched off. */
export const AUDIT_PURGE_INTERVAL = Symbol('AuditPurgeInterval');

const CONTEXT = { op: 'audit.purge', layer: 'infrastructure', module: 'audit' } as const;

/**
 * The internal job that keeps the trail within its retention window
 * ([D-07](../../../../docs/plans/03-rules-and-audit/decisions.md)).
 *
 * It runs the same use case as `pnpm db purge`, under the same lock, and says `job` where the
 * command says `cli`. It does not depend on how the product was installed, which is the whole reason
 * it is a job rather than a timer of the operating system.
 *
 * Switched off, it says so at boot, in `warn`: the retention promise may be switched off by
 * configuration, never die in silence. Every run is logged at `info`, a quiet one included — with no
 * rows deleted there is no record in the trail, and the log is what says the job is still running.
 */
@Injectable()
export class AuditPurgeJob extends PeriodicJob {
  constructor(
    @Inject(PurgeAuditTrailUseCase) private readonly purge: PurgeAuditTrailUseCase,
    @Inject(SCHEDULER) scheduler: Scheduler,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(AUDIT_PURGE_INTERVAL) private readonly intervalMs: number | null,
  ) {
    super(scheduler);
  }

  /** One purge, exposed so a test can run it at the instant it chooses. */
  async purgeNow(): Promise<void> {
    try {
      const report = await this.purge.execute('job');
      const summary = summarisePurge(report);

      if (report.status === 'failed') {
        this.logger.error(
          {
            ...CONTEXT,
            ...summary,
            err: report.trails.find((trail) => trail.failure !== null)?.failure?.error,
          },
          'the retention purge could not remove everything outside the window',
        );
        return;
      }

      this.logger.info(
        { ...CONTEXT, ...summary },
        report.status === 'skipped'
          ? 'another purge is running; this one removed nothing'
          : 'the audit trail was purged to its retention window',
      );
    } catch (error) {
      this.logger.error({ ...CONTEXT, err: error }, 'the retention purge failed before it began');
    }
  }

  protected cadence(): JobCadence | null {
    if (this.intervalMs === null) {
      this.logger.warn(
        { ...CONTEXT, retentionDays: this.purge.retentionDays },
        'the retention purge job is off: keeping the trail within its window now depends on ' +
          'somebody running `pnpm db purge`',
      );
      return null;
    }

    return { firstDelayMs: AUDIT_PURGE_FIRST_RUN_DELAY_MS, intervalMs: this.intervalMs };
  }

  protected run(): Promise<void> {
    return this.purgeNow();
  }
}
