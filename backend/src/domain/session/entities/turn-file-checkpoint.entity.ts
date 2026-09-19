import type { SessionId } from '../value-objects/session-id.value-object';

/** Whether the file was there before the turn touched it. */
export type FilePresence = 'present' | 'absent';

/**
 * Whether undo can promise this path back.
 *
 * `tooLarge` and `unreadable` are not failures to hide: the undo has to know it cannot promise a
 * file, rather than discovering that at the moment somebody asked for their work back.
 */
export type Restorability = 'yes' | 'tooLarge' | 'unreadable';

/** The persisted shape, as the mapper on either side of the repository sees it. */
export interface TurnFileCheckpointSnapshot {
  readonly sessionId: SessionId;
  readonly promptId: string;
  readonly path: string;
  readonly existedBefore: FilePresence;
  readonly blobPath: string | null;
  readonly hash: string | null;
  readonly sizeBytes: number;
  readonly restorable: Restorability;
  readonly promptText: string | null;
  readonly capturedAt: Date;
}

/**
 * What a file looked like before a turn touched it.
 *
 * The other half of undo. `SessionFileState` says how the session left a file; this says how it
 * was before, so a revert has something to restore. It cannot come from the CLI's own checkpoint
 * store, because `rewindFiles()` takes no file filter — "revert some and preserve the rest" only
 * exists if the snapshot is ours.
 *
 * The key is `(sessionId, promptId, path)`, and only the **first** touch of a turn writes one: the
 * second would replace the state at the start of the turn with an intermediate one, and the start
 * of the turn is what the undo point means.
 */
export class TurnFileCheckpoint {
  private constructor(private readonly state: TurnFileCheckpointSnapshot) {}

  static capture(snapshot: TurnFileCheckpointSnapshot): TurnFileCheckpoint {
    return new TurnFileCheckpoint(snapshot);
  }

  get sessionId(): SessionId {
    return this.state.sessionId;
  }

  get promptId(): string {
    return this.state.promptId;
  }

  get path(): string {
    return this.state.path;
  }

  get existedBefore(): FilePresence {
    return this.state.existedBefore;
  }

  get restorable(): Restorability {
    return this.state.restorable;
  }

  /** Whether undo can put this path back the way it was. */
  get canBeRestored(): boolean {
    // A file that was absent is restorable by deleting it, which needs no blob at all.
    return this.state.restorable === 'yes';
  }

  snapshot(): TurnFileCheckpointSnapshot {
    return this.state;
  }
}
