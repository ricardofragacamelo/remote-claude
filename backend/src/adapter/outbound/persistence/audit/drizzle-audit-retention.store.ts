import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';

import type {
  AuditPurgeBatch,
  AuditRetentionSession,
  AuditRetentionStore,
  Exclusive,
} from '@application/audit';
import type { AuditTrail } from '@domain/audit';
import { DATABASE_POOL } from '@infra/database/database.tokens';
import { auditEntries, auditEvents } from '@infra/database/schema';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { describedBy, runLogged } from '../query-logging';

/**
 * Key of the advisory lock the purge runs behind.
 *
 * Next to the migration's (`4_073_110_001`) and different from it: a purge must not wait for a
 * migration, and a migration must not wait for a purge. Fixed, because what matters is that the job
 * and the command use the same number.
 */
export const AUDIT_PURGE_LOCK_KEY = 4_073_110_002;

/** The table behind each trail. */
const TABLES = { entries: auditEntries, events: auditEvents } as const satisfies Record<
  AuditTrail,
  unknown
>;

/**
 * The retention purge, in PostgreSQL.
 *
 * **One connection for the whole run.** The lock is a session-level advisory lock — held across
 * batches that each commit on their own, which a transaction-scoped one cannot be — so the batches
 * run on the connection that holds it. If that connection dies, the lock dies with it: a crashed
 * purge never leaves the next one locked out.
 *
 * **`pg_try_advisory_lock`, never the waiting form.** The second purge has nothing to do that the
 * first is not already doing, and one that queued behind it would purge the same window again the
 * moment it got through (S-51).
 *
 * **A batch is one statement.** A data-modifying CTE takes the oldest rows before the cutoff,
 * deletes them, and inserts the record of how many went — so the rows leave and the record arrives
 * together, or neither happens ([D-19](../../../../../../docs/plans/03-rules-and-audit/decisions.md)).
 * The table's own trigger still sees every row, and refuses the statement if any of them is inside
 * the floor: the floor lives in the database, not here.
 *
 * It takes no row lock but the ones on the rows it deletes, all of them outside the window, so a
 * write to the trail never waits for it (S-38).
 */
@Injectable()
export class DrizzleAuditRetentionStore implements AuditRetentionStore {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: pg.Pool,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async exclusively<T>(
    work: (session: AuditRetentionSession) => Promise<T>,
  ): Promise<Exclusive<T>> {
    const client = await this.pool.connect();
    // A connection that failed mid-run is thrown away rather than handed back to the pool, where
    // the next query would find it broken — or, worse, still holding the lock.
    let healthy = true;

    // The pool listens for errors only on idle clients. One checked out for a long purge that loses
    // its server — a restart, a terminated backend — emits `error` with nobody listening, and an
    // unheard `error` event takes the whole process down. The failed query rejects on its own; this
    // is only so that the loss is logged instead of fatal.
    const onConnectionLost = (error: Error): void => {
      this.logger.warn(
        { op: 'audit.purge.connection', layer: 'adapter', module: 'audit', err: error },
        'the purge lost its database connection',
      );
    };
    client.on('error', onConnectionLost);

    try {
      const db = drizzle(client);

      if (!(await this.tryLock(db))) {
        return { acquired: false };
      }

      try {
        return { acquired: true, value: await work(this.sessionOn(db)) };
      } finally {
        healthy = await this.unlock(db);
      }
    } catch (error) {
      healthy = false;
      throw error;
    } finally {
      // Kept on a discarded client: it may still report the loss after it has left the pool.
      if (healthy) {
        client.off('error', onConnectionLost);
      }
      client.release(!healthy);
    }
  }

  private async tryLock(db: NodePgDatabase): Promise<boolean> {
    const result = await runLogged(
      this.logger,
      'audit.purge.lock',
      describedBy(
        db.execute<{ acquired: boolean }>(
          sql`SELECT pg_try_advisory_lock(${AUDIT_PURGE_LOCK_KEY}) AS "acquired"`,
        ),
      ),
    );

    return result.rows[0]?.acquired === true;
  }

  /**
   * Gives the lock back, and says whether the connection is still worth keeping.
   *
   * A failure here is not thrown: the purge has done its work and recorded it, and the lock goes
   * with the connection that is about to be discarded anyway.
   */
  private async unlock(db: NodePgDatabase): Promise<boolean> {
    try {
      await runLogged(
        this.logger,
        'audit.purge.unlock',
        describedBy(db.execute(sql`SELECT pg_advisory_unlock(${AUDIT_PURGE_LOCK_KEY})`)),
      );
      return true;
    } catch (error) {
      this.logger.warn(
        { op: 'audit.purge.unlock', layer: 'adapter', module: 'audit', err: error },
        'the purge lock could not be released; the connection is discarded, and the lock with it',
      );
      return false;
    }
  }

  private sessionOn(db: NodePgDatabase): AuditRetentionSession {
    return {
      purgeBatch: async (batch) => {
        const result = await runLogged(
          this.logger,
          `audit.purge.${batch.trail}`,
          describedBy(db.execute<{ deleted: number }>(batchStatement(batch))),
        );

        return result.rows[0]?.deleted ?? 0;
      },
    };
  }
}

/**
 * Deletes one batch and records it, as one statement.
 *
 * The parameters of the `SELECT` feeding the `INSERT` are cast: PostgreSQL does not infer a type
 * for a parameter in a select list, and an untyped one arrives as `text`.
 */
function batchStatement(batch: AuditPurgeBatch): ReturnType<typeof sql> {
  const table = TABLES[batch.trail];

  return sql`
    WITH doomed AS (
      SELECT ${table.id} AS "id" FROM ${table}
      WHERE ${table.at} < ${batch.cutoff}
      ORDER BY ${table.at}
      LIMIT ${batch.limit}
    ), gone AS (
      DELETE FROM ${table} WHERE ${table.id} IN (SELECT "id" FROM doomed) RETURNING 1
    )
    INSERT INTO "audit_purges"
      ("id", "purge_id", "triggered_by", "trail", "retention_days", "cutoff", "deleted", "at")
    SELECT ${batch.recordId}::text, ${batch.purgeId}::text, ${batch.triggeredBy}::text,
      ${batch.trail}::text, ${batch.retentionDays}::integer, ${batch.cutoff}::timestamptz,
      count(*)::integer, ${batch.at}::timestamptz
    FROM gone
    HAVING count(*) > 0
    RETURNING "deleted"`;
}
