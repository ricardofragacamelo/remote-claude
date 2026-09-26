import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';

import type { CancelScheduled, Scheduler } from '@application/shared';

/** When a job runs: first, and then every how long. */
export interface JobCadence {
  readonly firstDelayMs: number;
  readonly intervalMs: number;
}

/**
 * A job that runs on a cadence for as long as the application is up.
 *
 * It re-arms itself through the `Scheduler` port rather than using `setInterval`, for the same
 * reason every other deadline in this backend goes through it: one place arms timers, and that
 * place `unref`s them, so a pending run never holds the process open on its way out.
 *
 * The next run is armed when the previous one has **finished**, never on a fixed beat: a slow run
 * cannot pile a second one on top of itself. And it is armed whatever the run did — {@link run} is
 * expected to log its own failure and resolve, because a job that stopped for good after one bad
 * pass would be a job nobody notices has stopped.
 */
export abstract class PeriodicJob implements OnApplicationBootstrap, OnModuleDestroy {
  private cancel: CancelScheduled | null = null;
  private stopped = false;

  protected constructor(private readonly scheduler: Scheduler) {}

  /** The cadence, or `null` when this job is switched off. Read once, at boot. */
  protected abstract cadence(): JobCadence | null;

  /** One pass. Logs its own failure; never rejects. */
  protected abstract run(): Promise<void>;

  onApplicationBootstrap(): void {
    const cadence = this.cadence();

    if (cadence !== null) {
      this.arm(cadence.firstDelayMs, cadence.intervalMs);
    }
  }

  onModuleDestroy(): void {
    this.stopped = true;
    this.cancel?.();
    this.cancel = null;
  }

  private arm(delayMs: number, intervalMs: number): void {
    if (this.stopped) {
      return;
    }

    this.cancel = this.scheduler.after(delayMs, () => {
      void this.run().then(() => {
        this.arm(intervalMs, intervalMs);
      });
    });
  }
}
