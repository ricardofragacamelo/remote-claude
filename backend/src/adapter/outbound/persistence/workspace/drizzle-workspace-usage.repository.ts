import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';

import type { WorkspaceUsageRepository } from '@application/workspace';
import type { UserId } from '@domain/auth';
import type { WorkspaceUsage } from '@domain/workspace';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { workspaces } from '@infra/database/schema';
import { runLogged } from '../query-logging';
import { toEntity, toRow } from './workspace-usage.mapper';

/**
 * `workspaces`, in PostgreSQL.
 *
 * The technology is in the name on purpose: reading it tells you what breaks the day the storage
 * changes. It answers entities and holds no business rule.
 */
@Injectable()
export class DrizzleWorkspaceUsageRepository implements WorkspaceUsageRepository {
  constructor(@Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext) {}

  async findByUser(userId: UserId): Promise<readonly WorkspaceUsage[]> {
    const rows = await runLogged(
      this.context.logger,
      'workspace.findByUser',
      this.context.db
        .select()
        .from(workspaces)
        .where(eq(workspaces.userId, userId.value))
        .orderBy(desc(workspaces.lastUsedAt)),
    );

    return rows.map(toEntity);
  }

  async record(usage: WorkspaceUsage): Promise<void> {
    const row = toRow(usage, this.context.clock.now());

    // The conflict target is the primary key, which is the pair that *is* the identity of the
    // record — so the second use of the same root moves an instant and never adds a row (S-20).
    await runLogged(
      this.context.logger,
      'workspace.record',
      this.context.db
        .insert(workspaces)
        .values(row)
        .onConflictDoUpdate({
          target: [workspaces.userId, workspaces.rootPath],
          set: { label: row.label, lastUsedAt: row.lastUsedAt, updatedAt: row.updatedAt },
        }),
    );
  }
}
