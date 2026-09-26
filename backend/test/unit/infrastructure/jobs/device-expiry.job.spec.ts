import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecordAuditEventUseCase } from '@application/audit';
import { ExpirePendingDevicesUseCase } from '@application/auth';
import { DEVICE_SWEEP_INTERVAL_MS, DeviceExpiryJob } from '@infra/jobs/device-expiry.job';
import { aDevice, registeredAt } from '../../../support/builders/device.builder';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { InMemoryDeviceRepository } from '../../../support/fakes/in-memory-device.repository';
import { ManualScheduler } from '../../../support/fakes/manual-scheduler';
import { RecordingAuditEvents } from '../../../support/fakes/recording-audit-events';
import { RecordingLogger } from '../../../support/fakes/recording-logger';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const wellPast = new Date(registeredAt.getTime() + 30 * 24 * 60 * 60 * 1000);

let devices: InMemoryDeviceRepository;
let scheduler: ManualScheduler;
let logger: RecordingLogger;
let clock: FixedClock;

beforeEach(() => {
  devices = new InMemoryDeviceRepository();
  scheduler = new ManualScheduler();
  logger = new RecordingLogger();
  clock = new FixedClock(wellPast);
});

function aJob(expire?: ExpirePendingDevicesUseCase): DeviceExpiryJob {
  const events = new RecordingAuditEvents();
  const trail = new RecordAuditEventUseCase(events, new SequentialIds());

  return new DeviceExpiryJob(
    expire ?? new ExpirePendingDevicesUseCase({ devices, trail, clock }),
    scheduler,
    logger.logger,
  );
}

describe('DeviceExpiryJob', () => {
  it('arms itself on boot, at the sweep interval', () => {
    aJob().onApplicationBootstrap();

    expect(scheduler.delays).toEqual([DEVICE_SWEEP_INTERVAL_MS]);
  });

  it('sweeps when the interval passes, and arms the next sweep once it has finished', async () => {
    devices.seed(aDevice());
    aJob().onApplicationBootstrap();

    scheduler.fire();
    await vi.waitFor(() => {
      expect(scheduler.delays).toEqual([DEVICE_SWEEP_INTERVAL_MS, DEVICE_SWEEP_INTERVAL_MS]);
    });

    expect(devices.rows.size).toBe(0);
  });

  it('removes the forgotten registrations and says how many, at info', async () => {
    devices.seed(aDevice());

    await aJob().sweep();

    expect(devices.rows.size).toBe(0);
    expect(logger.withOp('device.expire')).toMatchObject([{ level: 'info', removed: 1 }]);
  });

  it('says nothing when there was nothing to remove — a quiet sweep is the normal one', async () => {
    await aJob().sweep();

    expect(logger.withOp('device.expire')).toHaveLength(0);
  });

  // A sweep that stopped for good after one bad hour is a sweep nobody notices has stopped.
  it('logs a failure at error and keeps running', async () => {
    const failing = {
      execute: () => Promise.reject(new Error('the database is away')),
    } as unknown as ExpirePendingDevicesUseCase;

    await aJob(failing).sweep();

    expect(logger.withOp('device.expire')).toMatchObject([{ level: 'error' }]);
  });

  it('stops for good once the module goes away', () => {
    const job = aJob();
    job.onApplicationBootstrap();

    job.onModuleDestroy();

    expect(scheduler.armed).toBe(0);
  });

  it('does not re-arm after it has been stopped', async () => {
    const job = aJob();
    job.onModuleDestroy();
    job.onApplicationBootstrap();

    await job.sweep();

    expect(scheduler.delays).toEqual([]);
  });
});
