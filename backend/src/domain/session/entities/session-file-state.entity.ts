import type { SessionId } from '../value-objects/session-id.value-object';

/** The persisted shape, as the mapper on either side of the repository sees it. */
export interface SessionFileStateSnapshot {
  readonly sessionId: SessionId;
  readonly path: string;
  readonly hash: string;
  readonly mtime: Date;
  readonly sizeBytes: number;
  readonly updatedAt: Date;
}

/**
 * How the session left a file.
 *
 * Recorded after the write, because the hash only exists then. It is the baseline the undo of a
 * later plan compares against: with it, "the session left it like this" and "somebody edited it
 * afterwards" are different states; without it, `rewindFiles()` overwrites the second in silence
 * and `dryRun` does not say so.
 *
 * The row is **overwritten** on every further write to the same path, which is exactly why this
 * is not an audit entry: the trail's trigger aborts `UPDATE`. One is "what resulted, now"; the
 * other is "what happened, for ever".
 */
export class SessionFileState {
  private constructor(
    readonly sessionId: SessionId,
    readonly path: string,
    readonly hash: string,
    readonly mtime: Date,
    readonly sizeBytes: number,
    readonly updatedAt: Date,
  ) {}

  static record(snapshot: SessionFileStateSnapshot): SessionFileState {
    return new SessionFileState(
      snapshot.sessionId,
      snapshot.path,
      snapshot.hash,
      snapshot.mtime,
      snapshot.sizeBytes,
      snapshot.updatedAt,
    );
  }

  snapshot(): SessionFileStateSnapshot {
    return {
      sessionId: this.sessionId,
      path: this.path,
      hash: this.hash,
      mtime: this.mtime,
      sizeBytes: this.sizeBytes,
      updatedAt: this.updatedAt,
    };
  }
}
