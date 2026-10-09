import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { ClaudeDefaultsRepository } from '@application/claude-config';
import type { UserId } from '@domain/auth';
import type { ClaudeDefaults, FolderDefaults } from '@domain/claude-config';
import type { IdGenerator } from '@domain/shared';
import { ID_GENERATOR } from '@application/shared';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { claudeDefaults } from '@infra/database/schema';
import { runLogged } from '../query-logging';
import { toDefaults, toRow } from './claude-defaults.mapper';

/**
 * `claude_defaults`, in PostgreSQL — the user's default (`folder_path` NULL) and the override of
 * each folder (plan 13, B-14).
 *
 * A save writes the **whole** row, `INSERT … ON CONFLICT DO UPDATE` on the unique key: two saves at
 * once leave one of them entire, never a mix of their fields (S-45). Every statement carries the
 * owner in its predicate.
 */
@Injectable()
export class DrizzleClaudeDefaultsRepository implements ClaudeDefaultsRepository {
  constructor(
    @Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async read(userId: UserId): Promise<{
    readonly user: ClaudeDefaults | null;
    readonly overrides: readonly FolderDefaults[];
  }> {
    const rows = await runLogged(
      this.context.logger,
      'claudeDefaults.read',
      this.context.db.select().from(claudeDefaults).where(eq(claudeDefaults.userId, userId.value)),
    );

    const user = rows.find((row) => row.folderPath === null);
    return {
      user: user === undefined ? null : toDefaults(user),
      overrides: rows.flatMap((row) =>
        row.folderPath === null ? [] : [{ folder: row.folderPath, values: toDefaults(row) }],
      ),
    };
  }

  async save(userId: UserId, folder: string | null, values: ClaudeDefaults): Promise<void> {
    const row = toRow(values);

    await runLogged(
      this.context.logger,
      'claudeDefaults.save',
      this.context.db
        .insert(claudeDefaults)
        .values({ id: this.ids.next(), userId: userId.value, folderPath: folder, ...row })
        .onConflictDoUpdate({
          target: [claudeDefaults.userId, claudeDefaults.folderPath],
          set: { ...row, updatedAt: this.context.clock.now() },
        }),
    );
  }

  async remove(userId: UserId, folder: string): Promise<boolean> {
    const removed = await runLogged(
      this.context.logger,
      'claudeDefaults.remove',
      this.context.db
        .delete(claudeDefaults)
        .where(and(eq(claudeDefaults.userId, userId.value), eq(claudeDefaults.folderPath, folder)))
        .returning({ id: claudeDefaults.id }),
    );

    return removed.length > 0;
  }
}
