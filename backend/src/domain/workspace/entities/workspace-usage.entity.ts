import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '../value-objects/workspace-path.value-object';

/** The persisted shape of a usage record, as the mapper on either side of the repository sees it. */
export interface WorkspaceUsageSnapshot {
  readonly userId: UserId;
  readonly root: WorkspacePath;
  readonly label: string;
  readonly lastUsedAt: Date;
}

/**
 * That a user reached a root, and when.
 *
 * It is the only thing about a workspace that goes to the database: metadata, never content — no
 * file, no listing, no tree. See docs/architecture/backend/05-persistence.md.
 *
 * The identity is the pair `(userId, root)`, which is what makes recording the same use twice a
 * no-op on the row count rather than a second row (S-20). The label is stored alongside because
 * it is what the root was *called* at the time; the allowlist file stays the source of truth for
 * what it is called now.
 */
export class WorkspaceUsage {
  private constructor(
    readonly userId: UserId,
    readonly root: WorkspacePath,
    readonly label: string,
    readonly lastUsedAt: Date,
  ) {}

  /** A use, as of `instant`. */
  static record(userId: UserId, root: WorkspacePath, label: string, instant: Date): WorkspaceUsage {
    return new WorkspaceUsage(userId, root, label, instant);
  }

  /** Rehydrates a record the repository read back. */
  static restore(snapshot: WorkspaceUsageSnapshot): WorkspaceUsage {
    return new WorkspaceUsage(snapshot.userId, snapshot.root, snapshot.label, snapshot.lastUsedAt);
  }

  snapshot(): WorkspaceUsageSnapshot {
    return {
      userId: this.userId,
      root: this.root,
      label: this.label,
      lastUsedAt: this.lastUsedAt,
    };
  }
}
