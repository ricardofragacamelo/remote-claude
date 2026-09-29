import type { PurgeNotificationsUseCase } from '@application/notification';
import type { Scheduler } from '@application/shared';
import type { Logger } from '@shared/logging/logger';
import { SweepJob } from './sweep-job';

/**
 * How often notifications past the thirty days are removed: hourly — housekeeping, not a promise to
 * the second, since an entry outliving its window by an hour harms nobody (06 · D-17).
 */
export const NOTIFICATION_RETENTION_INTERVAL_MS = 3_600_000;

/**
 * The periodic removal of notifications past their thirty days (plan 06, B-40). Built by the
 * module's factory, like every other class here that holds no decorator.
 */
export class NotificationRetentionJob extends SweepJob {
  constructor(
    private readonly purge: PurgeNotificationsUseCase,
    scheduler: Scheduler,
    logger: Logger,
    intervalMs: number = NOTIFICATION_RETENTION_INTERVAL_MS,
  ) {
    super(scheduler, logger, intervalMs, {
      op: 'notification.purge',
      module: 'notification',
      removed: 'removed notifications past their retention',
      failed: 'the removal of old notifications failed',
    });
  }

  protected removeDue(): Promise<number> {
    return this.purge.execute();
  }
}
