import { Inject, Injectable } from '@nestjs/common';

import type { SessionFileJournal } from '@application/session';
import { CLOCK } from '@application/shared';
import type { Clock } from '@domain/shared';
import { SessionFileState, TurnFileCheckpoint } from '@domain/session';
import type { Restorability, SessionId } from '@domain/session';
import { FileSnapshotStore } from '@adapter/outbound/checkpoint/file-snapshot.store';
import type { Snapshot } from '@adapter/outbound/checkpoint/file-snapshot.store';
import { DrizzleSessionFileRepository } from '@adapter/outbound/persistence/session/drizzle-session-file.repository';
import { LOGGER, type Logger } from '@shared/logging/logger';

/**
 * The journal: the row in PostgreSQL, the blob on disk.
 *
 * **Nothing here throws at the caller.** Every failure is logged and swallowed, and the asymmetry
 * with the audit trail is the point: without a trail there is no authorisation, but without a
 * baseline the undo is only more conservative. Degrading to "more conservative" is acceptable;
 * degrading to "executed with no record" is not
 * ([B-46](../../../../../docs/plans/01-live-session/F3-audit.md)).
 */
@Injectable()
export class DiskSessionFileJournal implements SessionFileJournal {
  /**
   * The prompt text of each open turn, by session and then by turn.
   *
   * Nested rather than keyed on a joined string: forgetting a session is then one `delete`, and
   * there is no separator to pick — a prompt id is opaque, and any character chosen as one is a
   * character that can turn up inside it.
   */
  private readonly labels = new Map<string, Map<string, string>>();

  constructor(
    @Inject(DrizzleSessionFileRepository) private readonly files: DrizzleSessionFileRepository,
    @Inject(FileSnapshotStore) private readonly snapshots: FileSnapshotStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  openTurn(sessionId: SessionId, promptId: string, promptText: string): Promise<void> {
    // Nothing is written yet: a turn that touches no file deserves no rows. What is kept is the
    // label, so the first snapshot of the turn can carry it.
    const turns = this.labels.get(sessionId.value) ?? new Map<string, string>();
    turns.set(promptId, promptText);
    this.labels.set(sessionId.value, turns);

    return Promise.resolve();
  }

  async captureBefore(sessionId: SessionId, promptId: string, path: string): Promise<void> {
    try {
      const snapshot = await this.snapshots.capture(sessionId.value, promptId, path);

      await this.files.saveCheckpointIfAbsent(
        TurnFileCheckpoint.capture({
          sessionId,
          promptId,
          path,
          existedBefore: snapshot.kind === 'absent' ? 'absent' : 'present',
          blobPath: snapshot.kind === 'captured' ? snapshot.blobPath : null,
          hash: snapshot.kind === 'captured' ? snapshot.hash : null,
          sizeBytes: sizeOf(snapshot),
          restorable: restorabilityOf(snapshot),
          promptText: this.labels.get(sessionId.value)?.get(promptId) ?? null,
          capturedAt: this.clock.now(),
        }),
      );
    } catch (error) {
      this.fail(sessionId, path, 'checkpoint', error);
    }
  }

  async recordResult(sessionId: SessionId, path: string): Promise<void> {
    try {
      const measured = await this.snapshots.measure(path);

      // Nothing there after a write that reported success: the tool did something other than
      // leave a file at that path. There is no baseline to record, and inventing one would be a
      // lie the undo would later act on.
      if (measured === null) {
        return;
      }

      await this.files.saveState(
        SessionFileState.record({
          sessionId,
          path,
          hash: measured.hash,
          mtime: measured.mtime,
          sizeBytes: measured.sizeBytes,
          updatedAt: this.clock.now(),
        }),
      );
    } catch (error) {
      this.fail(sessionId, path, 'state', error);
    }
  }

  /** Forgets the labels of a session's turns, once it is over. */
  forget(sessionId: SessionId): void {
    this.labels.delete(sessionId.value);
  }

  private fail(sessionId: SessionId, path: string, what: string, error: unknown): void {
    // `warn` and not `error`: nothing is broken for the user, and the only consequence is an undo
    // that will refuse to promise this path. Logging it at `error` would train everyone to ignore
    // the level that the audit trail actually needs.
    this.logger.warn(
      {
        op: 'sessionFile.journal',
        layer: 'adapter',
        sessionId: sessionId.value,
        path,
        what,
        err: error,
      },
      'the file journal could not be written — undo will be conservative about this path',
    );
  }
}

function sizeOf(snapshot: Snapshot): number {
  if (snapshot.kind === 'captured' || snapshot.kind === 'tooLarge') {
    return snapshot.sizeBytes;
  }

  return 0;
}

/** Whether undo can promise this path back. `absent` can: it is restored by deleting the file. */
function restorabilityOf(snapshot: Snapshot): Restorability {
  switch (snapshot.kind) {
    case 'captured':
    case 'absent':
      return 'yes';
    case 'tooLarge':
      return 'tooLarge';
    default:
      return 'unreadable';
  }
}
