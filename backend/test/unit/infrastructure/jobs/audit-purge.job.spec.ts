import { beforeEach, describe, expect, it } from 'vitest';

import { PurgeAuditTrailUseCase } from '@application/audit';
import { AUDIT_PURGE_FIRST_RUN_DELAY_MS, AuditPurgeJob } from '@infra/jobs/audit-purge.job';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { InMemoryAuditRetentionStore } from '../../../support/fakes/in-memory-audit-retention.store';
import { ManualScheduler } from '../../../support/fakes/manual-scheduler';
import { RecordingLogger } from '../../../support/fakes/recording-logger';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const now = new Date('2026-09-24T12:00:00.000Z');
const old = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000);
const DAY_MS = 24 * 60 * 60 * 1000;

let store: InMemoryAuditRetentionStore;
let scheduler: ManualScheduler;
let logger: RecordingLogger;

beforeEach(() => {
  store = new InMemoryAuditRetentionStore();
  scheduler = new ManualScheduler();
  logger = new RecordingLogger();
});

function aJob(intervalMs: number | null = DAY_MS, purge?: PurgeAuditTrailUseCase): AuditPurgeJob {
  return new AuditPurgeJob(
    purge ??
      new PurgeAuditTrailUseCase(store, new FixedClock(now), new SequentialIds(), {
        retentionDays: 90,
      }),
    scheduler,
    logger.logger,
    intervalMs,
  );
}

/** Lets the purge the scheduler just fired run to the end, and the job re-arm after it. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) {
    await Promise.resolve();
  }
}

describe('AuditPurgeJob', () => {
  describe('switched off — S-83', () => {
    it('arms nothing', () => {
      aJob(null).onApplicationBootstrap();

      expect(scheduler.delays).toEqual([]);
    });

    it('says at boot, in warn, that the retention now depends on the command', () => {
      aJob(null).onApplicationBootstrap();

      expect(logger.withOp('audit.purge')).toMatchObject([
        { level: 'warn', retentionDays: 90, msg: expect.stringContaining('pnpm db purge') },
      ]);
    });
  });

  describe('switched on — S-84', () => {
    it('runs the first purge a minute after boot, not a whole interval later', () => {
      aJob().onApplicationBootstrap();

      expect(scheduler.delays).toEqual([AUDIT_PURGE_FIRST_RUN_DELAY_MS]);
      expect(AUDIT_PURGE_FIRST_RUN_DELAY_MS).toBe(60_000);
    });

    it('re-arms at the interval once a purge has finished', async () => {
      store.seed('entries', old);
      aJob().onApplicationBootstrap();

      scheduler.fire();
      await settle();

      expect(store.rows.entries).toEqual([]);
      expect(scheduler.delays).toEqual([AUDIT_PURGE_FIRST_RUN_DELAY_MS, DAY_MS]);
    });

    it('re-arms after a failure too — a job that stops after one bad night is not noticed', async () => {
      const failing = {
        execute: () => Promise.reject(new Error('the database is away')),
        retentionDays: 90,
      } as unknown as PurgeAuditTrailUseCase;
      aJob(DAY_MS, failing).onApplicationBootstrap();

      scheduler.fire();
      await settle();

      expect(logger.withOp('audit.purge')).toMatchObject([
        { level: 'error', err: { message: 'the database is away' } },
      ]);
      expect(scheduler.delays).toEqual([AUDIT_PURGE_FIRST_RUN_DELAY_MS, DAY_MS]);
    });

    it('stops for good once the module goes away', () => {
      const job = aJob();
      job.onApplicationBootstrap();

      job.onModuleDestroy();

      expect(scheduler.armed).toBe(0);
    });
  });

  describe('what a run says', () => {
    it('logs a purge at info, with what it removed from each trail and who ran it', async () => {
      store.seed('entries', old, old);
      store.seed('events', old);

      await aJob().purgeNow();

      expect(logger.withOp('audit.purge')).toMatchObject([
        {
          level: 'info',
          status: 'completed',
          triggeredBy: 'job',
          retentionDays: 90,
          trails: [
            { trail: 'entries', deleted: 2, error: null },
            { trail: 'events', deleted: 1, error: null },
          ],
        },
      ]);
    });

    it('logs a quiet run at info too: without deletions it is the only sign the job runs', async () => {
      await aJob().purgeNow();

      expect(logger.withOp('audit.purge')).toMatchObject([{ level: 'info', status: 'completed' }]);
    });

    it('logs the purge that lost the lock at info, and why', async () => {
      store.held = true;

      await aJob().purgeNow();

      expect(logger.withOp('audit.purge')).toMatchObject([
        { level: 'info', status: 'skipped', reason: 'alreadyRunning' },
      ]);
    });

    it('logs a refused trail at error, with what the database said', async () => {
      store.seed('events', old);
      store.refusal = { trail: 'events', afterBatches: 0, error: new Error('refused') };

      await aJob().purgeNow();

      expect(logger.withOp('audit.purge')).toMatchObject([
        {
          level: 'error',
          status: 'failed',
          trails: [
            { trail: 'entries', deleted: 0, error: null },
            { trail: 'events', deleted: 0, error: 'refused' },
          ],
          err: { message: 'refused' },
        },
      ]);
    });
  });
});
