import { check, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { trailColumns } from './columns';

/**
 * The `audit_purges` table: what the retention purge removed, one row per batch.
 *
 * The row is written by the same statement that deletes the batch, so there is no instant at which
 * the trail has lost rows and nothing says who took them. It is not `audit_events`: every row there
 * belongs to somebody, and a purge sweeps everybody's trail at once
 * ([D-19](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
 *
 * Its triggers refuse `UPDATE` and `DELETE` alike, always: the record of what the purge removed is
 * not itself purgeable.
 */
export const auditPurges = pgTable(
  'audit_purges',
  {
    id: text('id').primaryKey(),
    /** The run: what groups the batches of one purge. */
    purgeId: text('purge_id').notNull(),
    /** `job` or `cli`. */
    triggeredBy: text('triggered_by').notNull(),
    /** `entries` or `events`. */
    trail: text('trail').notNull(),
    retentionDays: integer('retention_days').notNull(),
    /** Rows with `at` strictly before this were outside the window. */
    cutoff: timestamp('cutoff', { withTimezone: true }).notNull(),
    deleted: integer('deleted').notNull(),
    ...trailColumns,
  },
  (table) => [
    index('audit_purges_purge_id_idx').on(table.purgeId),
    check('audit_purges_triggered_by_known', sql`${table.triggeredBy} IN ('job', 'cli')`),
    check('audit_purges_trail_known', sql`${table.trail} IN ('entries', 'events')`),
    check('audit_purges_retention_at_least_floor', sql`${table.retentionDays} >= 90`),
    check('audit_purges_deleted_something', sql`${table.deleted} > 0`),
  ],
);
