import type { WorkspaceUsageRepository } from '@application/workspace';
import type { UserId } from '@domain/auth';
import type { WorkspaceUsage } from '@domain/workspace';

/**
 * The usage records, in a map.
 *
 * Keyed by the pair that is the identity of a record, so the fake answers the same thing about
 * duplicates as the table does — a fake that allows two rows where the schema allows one is a
 * fake that hides the bug it was meant to catch.
 */
export class InMemoryWorkspaceUsageRepository implements WorkspaceUsageRepository {
  readonly rows = new Map<string, WorkspaceUsage>();

  findByUser(userId: UserId): Promise<readonly WorkspaceUsage[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((usage) => usage.userId.equals(userId))
        .sort((left, right) => right.lastUsedAt.getTime() - left.lastUsedAt.getTime()),
    );
  }

  record(usage: WorkspaceUsage): Promise<void> {
    // `JSON.stringify` of the pair, rather than a separator character: a path may contain any
    // byte a filesystem allows, so any separator picked is a separator that can appear in a key.
    this.rows.set(JSON.stringify([usage.userId.value, usage.root.value]), usage);
    return Promise.resolve();
  }
}
