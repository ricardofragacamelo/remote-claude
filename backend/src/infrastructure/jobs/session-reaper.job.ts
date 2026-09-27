import { Inject, Injectable } from '@nestjs/common';

import { ReapIdleSessionsUseCase } from '@application/session';
import { SCHEDULER } from '@application/shared';
import type { Scheduler } from '@application/shared';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { PeriodicJob } from './periodic-job';
import type { JobCadence } from './periodic-job';

/** The longest the reaper waits between two passes: a session outlives its TTL by at most this. */
export const REAPER_MAX_INTERVAL_MS = 60_000;

/**
 * How often the reaper looks: a quarter of the TTL, never more than a minute.
 *
 * A quarter so a session is put away within a quarter of its TTL past it; a minute at most so the
 * thirty-minute TTL of the product (D-02) is kept to within one.
 */
export function reaperIntervalFor(ttlMs: number): number {
  return Math.min(REAPER_MAX_INTERVAL_MS, Math.floor(ttlMs / 4));
}

/** The periodic pass that closes the sessions idle for longer than the TTL — B-02. */
@Injectable()
export class SessionReaperJob extends PeriodicJob {
  constructor(
    @Inject(ReapIdleSessionsUseCase) private readonly reap: ReapIdleSessionsUseCase,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SCHEDULER) scheduler: Scheduler,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    super(scheduler);
  }

  /** One pass, exposed so a test can run it at the instant it chooses. */
  async sweep(): Promise<number> {
    try {
      const closed = await this.reap.execute();

      if (closed > 0) {
        this.logger.info(
          {
            op: 'session.reap',
            layer: 'infrastructure',
            module: 'session',
            closed,
            idleTtlMs: this.config.session.idleTtlMs,
          },
          'closed sessions idle past the TTL',
        );
      }

      return closed;
    } catch (error) {
      this.logger.error(
        { op: 'session.reap', layer: 'infrastructure', module: 'session', err: error },
        'the sweep of idle sessions failed',
      );
      return 0;
    }
  }

  protected cadence(): JobCadence {
    const intervalMs = reaperIntervalFor(this.config.session.idleTtlMs);
    return { firstDelayMs: intervalMs, intervalMs };
  }

  protected async run(): Promise<void> {
    await this.sweep();
  }
}
