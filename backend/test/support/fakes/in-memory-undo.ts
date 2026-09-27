import type { RestoredFile, UndoDisk, UndoJournal, UndoReach } from '@application/session';
import type { FileObservation, SessionFileState, TurnFileCheckpoint } from '@domain/session';

/** The journal the undo reads, in memory: whatever the test put in, filtered as the real one is. */
export class InMemoryUndoJournal implements UndoJournal {
  readonly checkpoints: TurnFileCheckpoint[] = [];
  readonly baselines: SessionFileState[] = [];
  readonly recorded: SessionFileState[] = [];

  checkpointsOf(reach: UndoReach): Promise<readonly TurnFileCheckpoint[]> {
    return Promise.resolve(this.checkpoints.filter((c) => reaches(reach, c.snapshot())));
  }

  baselinesOf(reach: UndoReach): Promise<readonly SessionFileState[]> {
    return Promise.resolve(
      [...this.baselines, ...this.recorded].filter((state) => reaches(reach, state.snapshot())),
    );
  }

  recordBaseline(state: SessionFileState): Promise<void> {
    this.recorded.push(state);
    return Promise.resolve();
  }

  reachOf(live: readonly UndoReach[]): Promise<ReadonlySet<string>> {
    const conversations = new Set(live.map((reach) => reach.claudeSessionId.value));
    const earlier = this.checkpoints
      .filter((c) => c.snapshot().claudeSessionId !== null)
      .filter((c) => conversations.has(c.snapshot().claudeSessionId?.value ?? ''))
      .map((c) => c.sessionId.value);

    return Promise.resolve(new Set([...live.map((reach) => reach.sessionId.value), ...earlier]));
  }
}

/** Whether a row is in the reach: of the live session, or of the conversation it is. */
function reaches(
  reach: UndoReach,
  row: {
    readonly sessionId: { readonly value: string };
    readonly claudeSessionId: { readonly value: string } | null;
  },
): boolean {
  return (
    row.sessionId.value === reach.sessionId.value ||
    row.claudeSessionId?.value === reach.claudeSessionId.value
  );
}

/** A disk of paths → hashes, which records what the undo did to it and can be told to fail. */
export class FakeUndoDisk implements UndoDisk {
  readonly files = new Map<string, FileObservation>();
  readonly restored: string[] = [];
  readonly removed: string[] = [];
  readonly failing = new Set<string>();
  observed = 0;

  /** Held until released, so a test can keep an undo in progress. */
  held: Promise<void> | null = null;

  async observe(path: string): Promise<FileObservation> {
    this.observed += 1;
    await this.held;
    return this.files.get(path) ?? { kind: 'absent' };
  }

  restore(checkpoint: TurnFileCheckpoint): Promise<RestoredFile> {
    if (this.failing.has(checkpoint.path)) {
      return Promise.reject(new Error('the disk said no'));
    }

    this.restored.push(checkpoint.path);
    this.files.set(checkpoint.path, { kind: 'file', hash: checkpoint.hash ?? '' });
    return Promise.resolve({ mtime: new Date('2026-09-26T12:30:00.000Z'), sizeBytes: 3 });
  }

  remove(path: string): Promise<void> {
    if (this.failing.has(path)) {
      return Promise.reject(new Error('the disk said no'));
    }

    this.removed.push(path);
    this.files.set(path, { kind: 'absent' });
    return Promise.resolve();
  }
}
