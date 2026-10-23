import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { PluginRepository, PluginWrite, StoredPlugin } from '@application/engines/claude';
import { UserId } from '@domain/auth';
import type { PluginOrigin } from '@domain/engines/claude';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { claudePlugins } from '@infra/database/schema';
import { runLogged } from '../../persistence/query-logging';

type Row = typeof claudePlugins.$inferSelect;

function storedOf(row: Row): StoredPlugin {
  return {
    id: row.id,
    userId: UserId.create(row.userId),
    origin: row.origin as PluginOrigin,
    path: row.path,
    marketplace: row.marketplace,
    commit: row.commit,
    name: row.name,
    approvedDigest: row.approvedDigest,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The first (and only, by construction) row of a `limit(1)` read, or `null` when there is none. */
function rowOrNull(rows: readonly Row[]): StoredPlugin | null {
  return rows[0] === undefined ? null : storedOf(rows[0]);
}

function insertRowOf(id: string, write: PluginWrite, now: Date): typeof claudePlugins.$inferInsert {
  return {
    id,
    userId: write.userId.value,
    origin: write.identity.origin,
    path: write.identity.path,
    marketplace: write.identity.marketplace,
    commit: write.identity.commit,
    name: write.name,
    approvedDigest: write.approvedDigest,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * `claude_plugins`, in PostgreSQL (plan 13, B-27; written by migration `0020`) — a user's plugins,
 * local and (B-47) from a marketplace. Unlike an MCP server there is no scope or folder: a plugin is
 * the user's, in every session, the same way the account is.
 */
@Injectable()
export class DrizzlePluginRepository implements PluginRepository {
  constructor(@Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext) {}

  async listFor(userId: UserId): Promise<readonly StoredPlugin[]> {
    const rows = await runLogged(
      this.context.logger,
      'plugin.listFor',
      this.context.db.select().from(claudePlugins).where(eq(claudePlugins.userId, userId.value)),
    );

    return rows.map(storedOf);
  }

  async findById(id: string): Promise<StoredPlugin | null> {
    return rowOrNull(
      await runLogged(
        this.context.logger,
        'plugin.findById',
        this.context.db.select().from(claudePlugins).where(eq(claudePlugins.id, id)).limit(1),
      ),
    );
  }

  async findByPath(userId: UserId, path: string): Promise<StoredPlugin | null> {
    return rowOrNull(
      await runLogged(
        this.context.logger,
        'plugin.findByPath',
        this.context.db
          .select()
          .from(claudePlugins)
          .where(and(eq(claudePlugins.userId, userId.value), eq(claudePlugins.path, path)))
          .limit(1),
      ),
    );
  }

  async insert(id: string, write: PluginWrite, now: Date): Promise<StoredPlugin> {
    const [row] = await runLogged(
      this.context.logger,
      'plugin.insert',
      this.context.db
        .insert(claudePlugins)
        .values(insertRowOf(id, write, now))
        .returning(),
    );

    // `RETURNING` on an insert that did not throw always answers with the row just written.
    return storedOf(row as Row);
  }

  async setEnabled(id: string, enabled: boolean, now: Date): Promise<StoredPlugin> {
    const [row] = await runLogged(
      this.context.logger,
      'plugin.setEnabled',
      this.context.db
        .update(claudePlugins)
        .set({ enabled, updatedAt: now })
        .where(eq(claudePlugins.id, id))
        .returning(),
    );

    return storedOf(row as Row);
  }

  async delete(id: string): Promise<void> {
    await runLogged(
      this.context.logger,
      'plugin.delete',
      this.context.db.delete(claudePlugins).where(eq(claudePlugins.id, id)),
    );
  }
}
