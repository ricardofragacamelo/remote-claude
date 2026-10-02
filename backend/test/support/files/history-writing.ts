import { RecordAuditEventUseCase } from '@application/audit';
import { FileTrail, UserWrites } from '@application/files';
import type { FileWriting, FolderDisk, HistoryKeeper } from '@application/files';
import { WorkspacePath } from '@domain/workspace';
import { IconvTextCodec } from '@adapter/outbound/files/iconv.text-codec';
import { InMemoryPathLock } from '@shared/concurrency/in-memory-path-lock';
import { FixedClock } from '../fakes/fixed-clock';
import { aHistoryKeeper, InMemoryFileHistory } from '../fakes/in-memory-file-history';
import { RecordingAuditEvents } from '../fakes/recording-audit-events';
import { SequentialIds } from '../fakes/sequential-ids';

/** The open folder every history scenario writes in. */
export const HISTORY_FOLDER = WorkspacePath.create('/srv/app');

/** What a use case of the local history is built with, and what a test looks at afterwards. */
export interface HistoryWriting {
  readonly writing: FileWriting;
  readonly events: RecordingAuditEvents;
  readonly store: InMemoryFileHistory;
  readonly keeper: HistoryKeeper;
  readonly failures: { error: unknown; path: string }[];
  readonly lock: InMemoryPathLock;
}

/**
 * The writing bundle over a stubbed disk, with a recorded trail and an in-memory history — what
 * the unit specs of the history's use cases share.
 */
export function historyWriting(
  disk: FolderDisk,
  limits: { maxFileBytes?: number; maxBatchEntries?: number } = {},
): HistoryWriting {
  const events = new RecordingAuditEvents();
  const store = new InMemoryFileHistory();
  const failures: { error: unknown; path: string }[] = [];
  const lock = new InMemoryPathLock();
  const clock = new FixedClock(new Date('2026-10-01T12:00:00.000Z'));

  return {
    writing: {
      folders: { resolve: () => Promise.resolve(HISTORY_FOLDER) },
      disk,
      codec: new IconvTextCodec(),
      lock,
      trail: new FileTrail(
        new RecordAuditEventUseCase(events, new SequentialIds('01J0AUD0000000000000')),
        clock,
        () => undefined,
      ),
      limits: { maxEditBytes: 65_536 },
      writes: new UserWrites(clock),
    },
    events,
    store,
    keeper: aHistoryKeeper(disk, { store, failures, ...limits }),
    failures,
    lock,
  };
}
