import { Inject, Injectable } from '@nestjs/common';

import { SessionRegistry, UNDO_JOURNAL } from '@application/session';
import type { UndoJournal } from '@application/session';
import { SCHEDULER } from '@application/shared';
import type { Scheduler } from '@application/shared';
import { FileSnapshotStore } from '@adapter/outbound/checkpoint/file-snapshot.store';
import { DrizzleSessionFileRepository } from '@adapter/outbound/persistence/session/drizzle-session-file.repository';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { PeriodicJob } from './periodic-job';
import type { JobCadence } from './periodic-job';

/**
 * How often the snapshot store is brought back under its ceiling, and how soon after boot.
 *
 * Constants and not configuration, like the limits of the transcript reads: nothing in them depends
 * on the machine, and the ceiling itself — which does — is already configured. Ten minutes is often
 * enough that a store written by a busy session does not run far past its ceiling between passes.
 */
export const SNAPSHOT_PURGE_FIRST_RUN_DELAY_MS = 60_000;
export const SNAPSHOT_PURGE_INTERVAL_MS = 600_000;

const CONTEXT = { op: 'checkpoint.purge', layer: 'infrastructure', module: 'session' } as const;

/**
 * Keeps the snapshot store under its ceiling — plan 04, S-67.
 *
 * The store had a ceiling and a purge since plan 01; this is what runs it. The purge drops the
 * oldest sessions first and **never** one a live session still reaches: its own snapshots, and those
 * of the earlier sessions of its conversation, which its undo can still go back to. Purging under a
 * session that is running would take away the only copy of somebody's file while they worked.
 *
 * The rows of what was removed go with it, so no checkpoint points at a blob that is gone.
 */
@Injectable()
export class SnapshotPurgeJob extends PeriodicJob {
  constructor(
    @Inject(FileSnapshotStore) private readonly store: FileSnapshotStore,
    @Inject(SessionRegistry) private readonly registry: SessionRegistry,
    @Inject(UNDO_JOURNAL) private readonly journal: UndoJournal,
    @Inject(DrizzleSessionFileRepository) private readonly files: DrizzleSessionFileRepository,
    @Inject(SCHEDULER) scheduler: Scheduler,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    super(scheduler);
  }

  /** One pass, exposed so a test can run it at the instant it chooses. Never rejects. */
  async purgeNow(): Promise<readonly string[]> {
    try {
      const keep = await this.journal.reachOf(
        this.registry.all().map((live) => ({
          sessionId: live.session.id,
          claudeSessionId: live.conversation.claudeSessionId,
        })),
      );
      const removed = await this.store.purge(keep);

      await this.files.forgetCheckpoints(removed);

      this.logger.info(
        { ...CONTEXT, removed: removed.length, kept: keep.size },
        removed.length === 0
          ? 'the snapshot store is within its ceiling'
          : 'the oldest snapshots were purged to keep the store within its ceiling',
      );

      return removed;
    } catch (error) {
      this.logger.error({ ...CONTEXT, err: error }, 'the snapshot purge failed');
      return [];
    }
  }

  protected cadence(): JobCadence {
    return {
      firstDelayMs: SNAPSHOT_PURGE_FIRST_RUN_DELAY_MS,
      intervalMs: SNAPSHOT_PURGE_INTERVAL_MS,
    };
  }

  protected async run(): Promise<void> {
    await this.purgeNow();
  }
}
