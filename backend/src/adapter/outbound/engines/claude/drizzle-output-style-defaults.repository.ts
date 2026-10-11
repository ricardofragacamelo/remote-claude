import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import type { OutputStyleDefaultsRepository } from '@application/engines/claude';
import { ID_GENERATOR } from '@application/shared';
import type { UserId } from '@domain/auth';
import type { OutputStyleDefaults } from '@domain/engines/claude';
import type { IdGenerator } from '@domain/shared';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { claudeOutputStyleDefaults } from '@infra/database/schema';
import { runLogged } from '../../persistence/query-logging';

/**
 * `claude_output_style_defaults`, in PostgreSQL — the output style each user set for Claude's
 * sessions, theirs (`folder_path` NULL) and each folder's (plan 28, B-36, D-06). A table of the
 * extension, with its prefix: the core's defaults are `agent_defaults`.
 *
 * A save is `INSERT … ON CONFLICT DO UPDATE` on the unique key, so the last one wins whole. Every
 * statement carries the owner in its predicate.
 */
@Injectable()
export class DrizzleOutputStyleDefaultsRepository implements OutputStyleDefaultsRepository {
  constructor(
    @Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async read(userId: UserId): Promise<OutputStyleDefaults> {
    const rows = await runLogged(
      this.context.logger,
      'outputStyleDefaults.read',
      this.context.db
        .select()
        .from(claudeOutputStyleDefaults)
        .where(eq(claudeOutputStyleDefaults.userId, userId.value)),
    );

    return {
      user: rows.find((row) => row.folderPath === null)?.outputStyle ?? null,
      overrides: rows.flatMap((row) =>
        row.folderPath === null ? [] : [{ folder: row.folderPath, value: row.outputStyle }],
      ),
    };
  }

  async save(userId: UserId, folder: string | null, style: string): Promise<void> {
    await runLogged(
      this.context.logger,
      'outputStyleDefaults.save',
      this.context.db
        .insert(claudeOutputStyleDefaults)
        .values({ id: this.ids.next(), userId: userId.value, folderPath: folder, outputStyle: style })
        .onConflictDoUpdate({
          target: [claudeOutputStyleDefaults.userId, claudeOutputStyleDefaults.folderPath],
          set: { outputStyle: style, updatedAt: this.context.clock.now() },
        }),
    );
  }

  async remove(userId: UserId, folder: string | null): Promise<boolean> {
    const removed = await runLogged(
      this.context.logger,
      'outputStyleDefaults.remove',
      this.context.db
        .delete(claudeOutputStyleDefaults)
        .where(
          and(
            eq(claudeOutputStyleDefaults.userId, userId.value),
            folder === null
              ? isNull(claudeOutputStyleDefaults.folderPath)
              : eq(claudeOutputStyleDefaults.folderPath, folder),
          ),
        )
        .returning({ id: claudeOutputStyleDefaults.id }),
    );

    return removed.length > 0;
  }
}
