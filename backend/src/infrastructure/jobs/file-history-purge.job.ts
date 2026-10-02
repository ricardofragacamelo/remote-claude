import type { Scheduler } from '@application/shared';
import type {
  DrizzleFileHistoryStore,
  HistoryPurge,
} from '@adapter/outbound/persistence/files/drizzle-file-history.store';
import type { Logger } from '@shared/logging/logger';
import { PeriodicJob } from './periodic-job';
import type { JobCadence } from './periodic-job';

/**
 * How often the local history is brought back under its ceilings, and how soon after boot.
 *
 * Constants and not configuration, like the snapshot purge's: nothing in them depends on the
 * machine, and the ceilings themselves — which do — are configured (`RC_FILES_HISTORY_*`). Ten
 * minutes keeps a busy morning of saves from running far past the total between passes.
 */
export const FILE_HISTORY_PURGE_FIRST_RUN_DELAY_MS = 60_000;
export const FILE_HISTORY_PURGE_INTERVAL_MS = 600_000;

const CONTEXT = { op: 'files.history.purge', layer: 'infrastructure', module: 'files' } as const;

/** What a pass that failed reports: nothing removed. */
const NOTHING: HistoryPurge = { aged: 0, trimmed: 0, overCeiling: 0, swept: 0 };

/**
 * Keeps the local history within its ceilings — plan 07, B-56, in the mould of the
 * `SnapshotPurgeJob` of the undo.
 *
 * One pass is the store's: past the retention, past the versions per path, past the total of the
 * distinct blobs — the oldest entries first —, and then the blobs no row names any more, all under
 * the exclusive advisory lock, so a keeping is never halfway beside it and two passes at once — this
 * job and a direct {@link purgeNow} — neither lose nor duplicate (S-334).
 */
export class FileHistoryPurgeJob extends PeriodicJob {
  constructor(
    private readonly store: DrizzleFileHistoryStore,
    scheduler: Scheduler,
    private readonly logger: Logger,
  ) {
    super(scheduler);
  }

  /** One pass, exposed so a test can run it at the instant it chooses. Never rejects. */
  async purgeNow(): Promise<HistoryPurge> {
    try {
      const purge = await this.store.purge();
      const removed = purge.aged + purge.trimmed + purge.overCeiling;

      this.logger.info(
        { ...CONTEXT, ...purge },
        removed + purge.swept === 0
          ? 'the local history is within its ceilings'
          : 'the oldest versions of the local history were purged to keep it within its ceilings',
      );

      return purge;
    } catch (error) {
      this.logger.error({ ...CONTEXT, err: error }, 'the purge of the local history failed');
      return NOTHING;
    }
  }

  protected cadence(): JobCadence {
    return {
      firstDelayMs: FILE_HISTORY_PURGE_FIRST_RUN_DELAY_MS,
      intervalMs: FILE_HISTORY_PURGE_INTERVAL_MS,
    };
  }

  protected async run(): Promise<void> {
    await this.purgeNow();
  }
}
