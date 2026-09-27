import { beforeEach, describe, expect, it } from 'vitest';

import { ReapIdleSessionsUseCase, SessionEnder } from '@application/session';
import type { AppConfig } from '@infra/config/environment';
import {
  REAPER_MAX_INTERVAL_MS,
  reaperIntervalFor,
  SessionReaperJob,
} from '@infra/jobs/session-reaper.job';
import { aClock, aRegistry, aSession } from '../../../support/builders/session.builder';
import type { FixedClock } from '../../../support/fakes/fixed-clock';
import { ManualScheduler } from '../../../support/fakes/manual-scheduler';
import { RecordingBroadcaster } from '../../../support/fakes/recording-broadcaster';
import { RecordingLogger } from '../../../support/fakes/recording-logger';

const TTL_MS = 4_000;
const config = { session: { idleTtlMs: TTL_MS } } as unknown as AppConfig;

describe('reaperIntervalFor', () => {
  it('looks every quarter of the TTL', () => {
    expect(reaperIntervalFor(4_000)).toBe(1_000);
  });

  it('never waits more than a minute, so a thirty-minute TTL is kept to within one', () => {
    expect(reaperIntervalFor(30 * 60 * 1000)).toBe(REAPER_MAX_INTERVAL_MS);
  });
});

describe('SessionReaperJob — B-02', () => {
  let scheduler: ManualScheduler;
  let logger: RecordingLogger;
  let clock: FixedClock;

  beforeEach(() => {
    scheduler = new ManualScheduler();
    logger = new RecordingLogger();
    clock = aClock();
  });

  function aJob(reap?: ReapIdleSessionsUseCase): SessionReaperJob {
    const session = aSession();
    session.moveTo('idle');
    const { registry } = aRegistry([session], 10, clock);
    const ender = new SessionEnder(registry, new RecordingBroadcaster());

    return new SessionReaperJob(
      reap ?? new ReapIdleSessionsUseCase(registry, ender, clock, TTL_MS),
      config,
      scheduler,
      logger.logger,
    );
  }

  it('arms itself on boot at a quarter of the TTL', () => {
    aJob().onApplicationBootstrap();

    expect(scheduler.delays).toEqual([1_000]);
  });

  it('says how many it closed, when it closed any', async () => {
    const job = aJob();
    clock.advance(TTL_MS);

    expect(await job.sweep()).toBe(1);
    expect(logger.withOp('session.reap')).toEqual([
      expect.objectContaining({ level: 'info', closed: 1, idleTtlMs: TTL_MS }),
    ]);
  });

  it('stays quiet when there was nothing to close', async () => {
    expect(await aJob().sweep()).toBe(0);
    expect(logger.withOp('session.reap')).toEqual([]);
  });

  it('logs a failed pass and keeps going', async () => {
    const broken = { execute: () => Promise.reject(new Error('boom')) };

    expect(await aJob(broken as unknown as ReapIdleSessionsUseCase).sweep()).toBe(0);
    expect(logger.withOp('session.reap')).toEqual([expect.objectContaining({ level: 'error' })]);
  });

  it('runs a pass when its time comes, and arms the next', async () => {
    const job = aJob();
    job.onApplicationBootstrap();
    clock.advance(TTL_MS);

    scheduler.fire();
    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.withOp('session.reap')).toHaveLength(1);
    expect(scheduler.armed).toBe(1);
  });
});
