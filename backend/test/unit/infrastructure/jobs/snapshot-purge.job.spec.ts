import { describe, expect, it } from 'vitest';

import type { FileSnapshotStore } from '@adapter/outbound/checkpoint/file-snapshot.store';
import type { DrizzleSessionFileRepository } from '@adapter/outbound/persistence/session/drizzle-session-file.repository';
import { TurnFileCheckpoint, SessionId } from '@domain/session';
import { ClaudeSessionId } from '@domain/transcript';
import {
  SNAPSHOT_PURGE_FIRST_RUN_DELAY_MS,
  SNAPSHOT_PURGE_INTERVAL_MS,
  SnapshotPurgeJob,
} from '@infra/jobs/snapshot-purge.job';
import {
  aRegistry,
  aSession,
  CONVERSATION_ID,
  SESSION_ID,
} from '../../../support/builders/session.builder';
import { InMemoryUndoJournal } from '../../../support/fakes/in-memory-undo';
import { ManualScheduler } from '../../../support/fakes/manual-scheduler';
import { RecordingLogger } from '../../../support/fakes/recording-logger';

/** An earlier session of the same conversation, and one of another. */
const EARLIER = '01J0ABCDEFGHJKMNPQRSTVWXY0';
const UNRELATED = '01J0ABCDEFGHJKMNPQRSTVWXY1';

/** A store that says it purged whatever it was not told to keep, among the sessions it holds. */
function aStore(holding: readonly string[], fails: Error | null = null) {
  const asked: ReadonlySet<string>[] = [];
  const store = {
    purge: (live: ReadonlySet<string>) => {
      asked.push(live);
      return fails === null
        ? Promise.resolve(holding.filter((id) => !live.has(id)))
        : Promise.reject(fails);
    },
  } as unknown as FileSnapshotStore;

  return { store, asked };
}

function aRepository() {
  const forgotten: (readonly string[])[] = [];
  const files = {
    forgetCheckpoints: (ids: readonly string[]) => {
      forgotten.push(ids);
      return Promise.resolve();
    },
  } as unknown as DrizzleSessionFileRepository;

  return { files, forgotten };
}

function job(
  store: FileSnapshotStore,
  files: DrizzleSessionFileRepository,
  log = new RecordingLogger(),
) {
  const journal = new InMemoryUndoJournal();
  journal.checkpoints.push(
    TurnFileCheckpoint.capture({
      sessionId: SessionId.create(EARLIER),
      claudeSessionId: ClaudeSessionId.create(CONVERSATION_ID),
      promptId: 'p0',
      path: '/srv/a.md',
      existedBefore: 'present',
      blobPath: '/store/x',
      hash: 'h',
      sizeBytes: 1,
      restorable: 'yes',
      promptText: null,
      capturedAt: new Date('2026-09-26T11:00:00.000Z'),
    }),
  );
  const scheduler = new ManualScheduler();
  const purge = new SnapshotPurgeJob(
    store,
    aRegistry([aSession()]).registry,
    journal,
    files,
    scheduler,
    log.logger,
  );

  return { purge, scheduler, log };
}

describe('SnapshotPurgeJob', () => {
  it('keeps what a live session reaches, and forgets the rows of what it removed — S-67', async () => {
    const { store, asked } = aStore([SESSION_ID, EARLIER, UNRELATED]);
    const { files, forgotten } = aRepository();

    const removed = await job(store, files).purge.purgeNow();

    expect([...(asked[0] ?? [])].sort()).toEqual([EARLIER, SESSION_ID].sort());
    expect(removed).toEqual([UNRELATED]);
    expect(forgotten).toEqual([[UNRELATED]]);
  });

  it('logs every pass, a quiet one included', async () => {
    const { store } = aStore([SESSION_ID]);
    const { files } = aRepository();
    const log = new RecordingLogger();

    await job(store, files, log).purge.purgeNow();

    expect(log.withOp('checkpoint.purge')[0]).toMatchObject({ level: 'info', removed: 0 });
  });

  it('logs a failure and never rejects, so the next pass still runs', async () => {
    const { store } = aStore([], new Error('the disk is gone'));
    const { files } = aRepository();
    const log = new RecordingLogger();

    await expect(job(store, files, log).purge.purgeNow()).resolves.toEqual([]);
    expect(log.withOp('checkpoint.purge')[0]).toMatchObject({ level: 'error' });
  });

  it('runs a minute after boot and then on its interval', async () => {
    const { store, asked } = aStore([]);
    const { files } = aRepository();
    const { purge, scheduler } = job(store, files);

    purge.onApplicationBootstrap();
    scheduler.fire();
    for (let turn = 0; turn < 20; turn += 1) {
      await Promise.resolve();
    }

    expect(asked).toHaveLength(1);
    expect(scheduler.delays).toEqual([
      SNAPSHOT_PURGE_FIRST_RUN_DELAY_MS,
      SNAPSHOT_PURGE_INTERVAL_MS,
    ]);
    purge.onModuleDestroy();
  });
});
