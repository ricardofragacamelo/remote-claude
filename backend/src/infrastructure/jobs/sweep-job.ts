import type { Scheduler } from '@application/shared';
import type { Logger } from '@shared/logging/logger';
import { PeriodicJob } from './periodic-job';
import type { JobCadence } from './periodic-job';

/** How a sweep introduces itself in the log. */
export interface SweepDescription {
  readonly op: string;
  readonly module: string;
  /** Said at `info` when something was removed. */
  readonly removed: string;
  /** Said at `error` when the pass failed. */
  readonly failed: string;
}

/**
 * A job that removes what is past its time, on a fixed interval, and says how many.
 *
 * The first pass waits the whole interval — what a sweep removes is housekeeping, and nothing is lost
 * by it outliving its deadline by one interval. A quiet pass says nothing; a failed one says so at
 * `error` and the next one is armed anyway, because a sweep that stopped for good after one bad pass
 * is a sweep nobody notices has stopped.
 */
export abstract class SweepJob extends PeriodicJob {
  protected constructor(
    scheduler: Scheduler,
    private readonly logger: Logger,
    private readonly intervalMs: number,
    private readonly description: SweepDescription,
  ) {
    super(scheduler);
  }

  /** What one pass removes, and how many went. */
  protected abstract removeDue(): Promise<number>;

  /** One pass, exposed so a test can run it at the instant it chooses. */
  async sweep(): Promise<void> {
    const context = {
      op: this.description.op,
      layer: 'infrastructure',
      module: this.description.module,
    };

    try {
      const removed = await this.removeDue();

      if (removed > 0) {
        this.logger.info({ ...context, removed }, this.description.removed);
      }
    } catch (error) {
      this.logger.error({ ...context, err: error }, this.description.failed);
    }
  }

  protected cadence(): JobCadence {
    return { firstDelayMs: this.intervalMs, intervalMs: this.intervalMs };
  }

  protected run(): Promise<void> {
    return this.sweep();
  }
}
