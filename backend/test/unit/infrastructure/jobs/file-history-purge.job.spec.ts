import { describe, expect, it } from 'vitest';

import type {
  DrizzleFileHistoryStore,
  HistoryPurge,
} from '@adapter/outbound/persistence/files/drizzle-file-history.store';
import {
  FILE_HISTORY_PURGE_FIRST_RUN_DELAY_MS,
  FILE_HISTORY_PURGE_INTERVAL_MS,
  FileHistoryPurgeJob,
} from '@infra/jobs/file-history-purge.job';
import { ManualScheduler } from '../../../support/fakes/manual-scheduler';
import { RecordingLogger } from '../../../support/fakes/recording-logger';

/** A store whose purge answers what it is told, and counts how often it was asked. */
function aStore(answer: () => Promise<HistoryPurge>) {
  const calls = { count: 0 };
  const store = {
    purge: () => {
      calls.count += 1;
      return answer();
    },
  } as unknown as DrizzleFileHistoryStore;

  return { store, calls };
}

const quiet: HistoryPurge = { aged: 0, trimmed: 0, overCeiling: 0, swept: 0 };

describe('FileHistoryPurgeJob — B-56', () => {
  it('reports what one pass removed', async () => {
    const log = new RecordingLogger();
    const removed = { aged: 2, trimmed: 1, overCeiling: 3, swept: 4 };
    const { store } = aStore(() => Promise.resolve(removed));

    await expect(
      new FileHistoryPurgeJob(store, new ManualScheduler(), log.logger).purgeNow(),
    ).resolves.toEqual(removed);
    expect(log.withOp('files.history.purge')[0]).toMatchObject({ level: 'info', ...removed });
  });

  it('logs a quiet pass too', async () => {
    const log = new RecordingLogger();
    const { store } = aStore(() => Promise.resolve(quiet));

    await new FileHistoryPurgeJob(store, new ManualScheduler(), log.logger).purgeNow();

    expect(log.withOp('files.history.purge')[0]?.msg).toBe(
      'the local history is within its ceilings',
    );
  });

  it('logs a failure and never rejects, so the next pass still runs', async () => {
    const log = new RecordingLogger();
    const { store } = aStore(() => Promise.reject(new Error('database down')));

    await expect(
      new FileHistoryPurgeJob(store, new ManualScheduler(), log.logger).purgeNow(),
    ).resolves.toEqual(quiet);
    expect(log.withOp('files.history.purge')[0]).toMatchObject({ level: 'error' });
  });

  it('runs a minute after boot and then every ten minutes', async () => {
    const scheduler = new ManualScheduler();
    const { store, calls } = aStore(() => Promise.resolve(quiet));
    const job = new FileHistoryPurgeJob(store, scheduler, new RecordingLogger().logger);

    job.onApplicationBootstrap();
    scheduler.fire();
    for (let turn = 0; turn < 20; turn += 1) {
      await Promise.resolve();
    }

    expect(calls.count).toBe(1);
    expect(scheduler.delays).toEqual([
      FILE_HISTORY_PURGE_FIRST_RUN_DELAY_MS,
      FILE_HISTORY_PURGE_INTERVAL_MS,
    ]);
    job.onModuleDestroy();
  });
});
