import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { AgentDefaultsRepository, StoredDefaults } from '@application/agent-settings';
import type { AgentDefaults } from '@domain/agent-settings';
import type { UserId } from '@domain/auth';
import type { IdGenerator } from '@domain/shared';
import { ID_GENERATOR } from '@application/shared';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { agentDefaults } from '@infra/database/schema';
import { runLogged } from '../query-logging';
import { toDefaults, toRow } from './agent-defaults.mapper';

/**
 * `agent_defaults`, in PostgreSQL — for each engine, the user's default (`folder_path` NULL) and the
 * override of each folder (plan 13, B-14; plan 28, B-36).
 *
 * A save writes the **whole** row, `INSERT … ON CONFLICT DO UPDATE` on the unique key: two saves at
 * once leave one of them entire, never a mix of their fields (S-45). Every statement carries the
 * owner and the engine in its predicate.
 */
@Injectable()
export class DrizzleAgentDefaultsRepository implements AgentDefaultsRepository {
  constructor(
    @Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext,
    // Mints the id of a default this engine of this user has never had a row for yet.
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  /** The engine's defaults: the user's own, and the folders that override them. */
  async read(userId: UserId, engine: string): Promise<StoredDefaults> {
    const rows = await runLogged(
      this.context.logger,
      'agentDefaults.read',
      this.context.db
        .select()
        .from(agentDefaults)
        .where(and(eq(agentDefaults.userId, userId.value), eq(agentDefaults.engine, engine))),
    );

    const user = rows.find((row) => row.folderPath === null);
    return {
      user: user === undefined ? null : toDefaults(user),
      overrides: rows.flatMap((row) =>
        row.folderPath === null ? [] : [{ folder: row.folderPath, values: toDefaults(row) }],
      ),
    };
  }

  async save(
    userId: UserId,
    engine: string,
    folder: string | null,
    values: AgentDefaults,
  ): Promise<void> {
    const row = toRow(values);

    await runLogged(
      this.context.logger,
      'agentDefaults.save',
      this.context.db
        .insert(agentDefaults)
        .values({ id: this.ids.next(), userId: userId.value, engine, folderPath: folder, ...row })
        .onConflictDoUpdate({
          target: [agentDefaults.userId, agentDefaults.engine, agentDefaults.folderPath],
          set: { ...row, updatedAt: this.context.clock.now() },
        }),
    );
  }

  async remove(userId: UserId, engine: string, folder: string): Promise<boolean> {
    const removed = await runLogged(
      this.context.logger,
      'agentDefaults.remove',
      this.context.db
        .delete(agentDefaults)
        .where(
          and(
            eq(agentDefaults.userId, userId.value),
            eq(agentDefaults.engine, engine),
            eq(agentDefaults.folderPath, folder),
          ),
        )
        .returning({ id: agentDefaults.id }),
    );

    return removed.length > 0;
  }
}
