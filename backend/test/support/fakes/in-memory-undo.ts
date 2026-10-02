import { createHash } from 'node:crypto';

import type {
  FileContent,
  RestoredFile,
  UndoDisk,
  UndoJournal,
  UndoReach,
  WrittenFile,
} from '@application/session';
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

  /** The bytes of a path, for a test about contents; a path without them reads as empty. */
  readonly contents = new Map<string, Uint8Array>();

  /** The bytes of each snapshot, by blob path. */
  readonly snapshots = new Map<string, Uint8Array>();
  readonly written: string[] = [];
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
    this.contents.delete(path);
    return Promise.resolve();
  }

  async read(path: string, maxBytes: number): Promise<FileContent> {
    await this.held;
    const observed = this.files.get(path) ?? { kind: 'absent' };

    if (observed.kind !== 'file') {
      return observed;
    }

    const bytes = this.contents.get(path) ?? new Uint8Array();

    return bytes.byteLength > maxBytes
      ? { kind: 'tooLarge', sizeBytes: bytes.byteLength }
      : { kind: 'file', bytes, hash: observed.hash };
  }

  snapshotOf(checkpoint: TurnFileCheckpoint): Promise<Uint8Array> {
    const bytes =
      checkpoint.blobPath === null ? undefined : this.snapshots.get(checkpoint.blobPath);

    return bytes === undefined
      ? Promise.reject(new Error(`no snapshot for ${checkpoint.path}`))
      : Promise.resolve(bytes);
  }

  write(path: string, content: Uint8Array): Promise<WrittenFile> {
    if (this.failing.has(path)) {
      return Promise.reject(new Error('the disk said no'));
    }

    const hash = hashOf(content);
    this.written.push(path);
    this.files.set(path, { kind: 'file', hash });
    this.contents.set(path, content);
    return Promise.resolve({
      mtime: new Date('2026-09-26T12:30:00.000Z'),
      sizeBytes: content.byteLength,
      hash,
    });
  }

  /** Puts a text at a path, with the hash the real disk would give it. */
  put(path: string, text: string): string {
    const bytes = new TextEncoder().encode(text);
    const hash = hashOf(bytes);
    this.files.set(path, { kind: 'file', hash });
    this.contents.set(path, bytes);
    return hash;
  }
}

/** SHA-256 in hex, as the real disk hashes. */
export function hashOf(content: Uint8Array | string): string {
  return createHash('sha256')
    .update(typeof content === 'string' ? new TextEncoder().encode(content) : content)
    .digest('hex');
}
