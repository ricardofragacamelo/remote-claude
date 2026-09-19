import type { UserId } from '@domain/auth';
import type { WorkspaceUsage } from '@domain/workspace';

/**
 * How "this user reached this root, then" is stored and read back.
 *
 * It answers entities, never rows. Metadata only: no file content, no listing, no tree — see
 * docs/architecture/backend/05-persistence.md.
 */
export interface WorkspaceUsageRepository {
  /** Every root this user has used, most recently used first. */
  findByUser(userId: UserId): Promise<readonly WorkspaceUsage[]>;

  /**
   * Records a use.
   *
   * Recording the same `(userId, root)` twice updates the instant; it never adds a second row —
   * the pair is the identity, not a surrogate key (S-20).
   */
  record(usage: WorkspaceUsage): Promise<void>;
}

export const WORKSPACE_USAGE_REPOSITORY = Symbol('WorkspaceUsageRepository');
