import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PurgeNotificationsUseCase } from '@application/notification';
import { UserId } from '@domain/auth';
import { NotificationEntry } from '@domain/notification';
import {
  NOTIFICATION_RETENTION_INTERVAL_MS,
  NotificationRetentionJob,
} from '@infra/jobs/notification-retention.job';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { InMemoryNotificationHistoryRepository } from '../../../support/fakes/in-memory-notification-history.repository';
import { ManualScheduler } from '../../../support/fakes/manual-scheduler';
import { RecordingLogger } from '../../../support/fakes/recording-logger';

const createdAt = new Date('2026-08-01T12:00:00.000Z');
const wellPast = new Date('2026-09-28T12:00:00.000Z');

let history: InMemoryNotificationHistoryRepository;
let scheduler: ManualScheduler;
let logger: RecordingLogger;

beforeEach(() => {
  history = new InMemoryNotificationHistoryRepository();
  scheduler = new ManualScheduler();
  logger = new RecordingLogger();
});

function aJob(purge?: PurgeNotificationsUseCase): NotificationRetentionJob {
  return new NotificationRetentionJob(
    purge ?? new PurgeNotificationsUseCase(history, new FixedClock(wellPast)),
    scheduler,
    logger.logger,
  );
}

function seedOld(): void {
  history.entries.push(
    NotificationEntry.record(
      {
        userId: UserId.create('auth|owner'),
        clientId: 'old',
        severity: 'info',
        messageKey: 'notification.connection.restored',
        params: {},
        count: 1,
      },
      '01J00000000000000000000001',
      createdAt,
    ),
  );
}

describe('NotificationRetentionJob — plan 06, B-40', () => {
  it('arms itself on boot, hourly', () => {
    aJob().onApplicationBootstrap();

    expect(scheduler.delays).toEqual([NOTIFICATION_RETENTION_INTERVAL_MS]);
    expect(NOTIFICATION_RETENTION_INTERVAL_MS).toBe(60 * 60 * 1000);
  });

  it('removes what passed thirty days when the interval passes, and arms again', async () => {
    seedOld();
    aJob().onApplicationBootstrap();

    scheduler.fire();
    await vi.waitFor(() => {
      expect(scheduler.delays).toHaveLength(2);
    });

    expect(history.entries).toEqual([]);
    expect(logger.withOp('notification.purge')).toMatchObject([{ level: 'info', removed: 1 }]);
  });

  it('says nothing when there was nothing to remove', async () => {
    await aJob().sweep();

    expect(logger.withOp('notification.purge')).toHaveLength(0);
  });

  it('logs a failure at error and keeps running', async () => {
    const failing = {
      execute: () => Promise.reject(new Error('the database is away')),
    } as unknown as PurgeNotificationsUseCase;

    await aJob(failing).sweep();

    expect(logger.withOp('notification.purge')).toMatchObject([{ level: 'error' }]);
  });
});
