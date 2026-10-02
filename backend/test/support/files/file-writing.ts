import { RecordAuditEventUseCase } from '@application/audit';
import { FileTrail, UserWrites } from '@application/files';
import type { FileWriting } from '@application/files';
import { WorkspacePath } from '@domain/workspace';
import { IconvTextCodec } from '@adapter/outbound/files/iconv.text-codec';
import { InMemoryPathLock } from '@shared/concurrency/in-memory-path-lock';
import { FixedClock } from '../fakes/fixed-clock';
import { RecordingAuditEvents } from '../fakes/recording-audit-events';
import { SequentialIds } from '../fakes/sequential-ids';
import { stubFolderDisk } from '../fakes/stub-folder-disk';

/** The open folder the unit specs of the writes resolve to. */
export const WRITING_FOLDER = WorkspacePath.create('/srv/app');

/** The instant every fake clock of these specs reads. */
export const WRITING_NOW = new Date('2026-10-01T12:00:00.000Z');

/** A trail over a recorded repository — `events.appended` is what reached it, in order. */
export function aFileTrail(events: RecordingAuditEvents = new RecordingAuditEvents()): FileTrail {
  return new FileTrail(
    new RecordAuditEventUseCase(events, new SequentialIds('01J0AUD0000000000000')),
    new FixedClock(WRITING_NOW),
    () => undefined,
  );
}

/**
 * Everything a write of the person's is given, with a default for each part — a disk that refuses
 * every call, a folder that always resolves, a trail nobody looks at — and the test overrides only
 * what its scenario is about. **Never build a `FileWriting` literal in a spec**: a field added to it
 * is then added here once, rather than in every spec that builds one.
 */
export function aFileWriting(overrides: Partial<FileWriting> = {}): FileWriting {
  return {
    folders: { resolve: () => Promise.resolve(WRITING_FOLDER) },
    disk: stubFolderDisk({}),
    codec: new IconvTextCodec(),
    lock: new InMemoryPathLock(),
    trail: aFileTrail(),
    limits: { maxEditBytes: 65_536 },
    writes: new UserWrites(new FixedClock(WRITING_NOW)),
    ...overrides,
  };
}
