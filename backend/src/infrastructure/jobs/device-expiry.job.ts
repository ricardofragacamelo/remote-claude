import { Inject, Injectable } from '@nestjs/common';

import { ExpirePendingDevicesUseCase } from '@application/auth';
import { SCHEDULER } from '@application/shared';
import type { Scheduler } from '@application/shared';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { PeriodicJob } from './periodic-job';
import type { JobCadence } from './periodic-job';

/**
 * How often the forgotten registrations are swept.
 *
 * An hour, against a deadline of seven days: the cadence is not a security boundary, because
 * approving a registration past the deadline is refused by the use case whether or not the sweep
 * has run. What the job buys is that the row actually goes, so the list stays short.
 */
export const DEVICE_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * The periodic sweep of pending devices nobody approved.
 *
 * The first sweep waits the whole interval: nothing is lost by a registration outliving its
 * deadline by an hour, because approving it is refused either way.
 */
@Injectable()
export class DeviceExpiryJob extends PeriodicJob {
  constructor(
    @Inject(ExpirePendingDevicesUseCase) private readonly expire: ExpirePendingDevicesUseCase,
    @Inject(SCHEDULER) scheduler: Scheduler,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly intervalMs: number = DEVICE_SWEEP_INTERVAL_MS,
  ) {
    super(scheduler);
  }

  /** One pass, exposed so a test can run it at the instant it chooses. */
  async sweep(): Promise<void> {
    try {
      const removed = await this.expire.execute();

      if (removed > 0) {
        this.logger.info(
          { op: 'device.expire', layer: 'infrastructure', module: 'auth', removed },
          'removed pending device registrations past the deadline',
        );
      }
    } catch (error) {
      this.logger.error(
        { op: 'device.expire', layer: 'infrastructure', module: 'auth', err: error },
        'the sweep of pending devices failed',
      );
    }
  }

  protected cadence(): JobCadence {
    return { firstDelayMs: this.intervalMs, intervalMs: this.intervalMs };
  }

  protected run(): Promise<void> {
    return this.sweep();
  }
}
