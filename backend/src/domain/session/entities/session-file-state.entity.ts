import type { ClaudeSessionId } from '@domain/transcript';
import type { SessionId } from '../value-objects/session-id.value-object';

/** The persisted shape, as the mapper on either side of the repository sees it. */
export interface SessionFileStateSnapshot {
  readonly sessionId: SessionId;

  /** The conversation the session was, or `null` for a row older than the undo that reads it. */
  readonly claudeSessionId: ClaudeSessionId | null;
  readonly path: string;

  /**
   * SHA-256 of what the session left, or `null` when it left **no file** — its own undo removed
   * one the undone turn had created.
   */
  readonly hash: string | null;
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
  private constructor(private readonly state: SessionFileStateSnapshot) {}

  static record(snapshot: SessionFileStateSnapshot): SessionFileState {
    return new SessionFileState(snapshot);
  }

  get sessionId(): SessionId {
    return this.state.sessionId;
  }

  get path(): string {
    return this.state.path;
  }

  /** What the session left, or `null` when it left no file there. */
  get hash(): string | null {
    return this.state.hash;
  }

  get mtime(): Date {
    return this.state.mtime;
  }

  get sizeBytes(): number {
    return this.state.sizeBytes;
  }

  get updatedAt(): Date {
    return this.state.updatedAt;
  }

  snapshot(): SessionFileStateSnapshot {
    return this.state;
  }
}
