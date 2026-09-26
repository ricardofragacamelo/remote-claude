import { check, index, pgTable, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { keysetIndexes, trailColumns } from './columns';

/**
 * The `audit_events` table: the security facts of an account that are not a tool invocation.
 *
 * It is `audit_entries`' sibling rather than a widening of it. That table is shaped around one
 * invocation — a session, a tool name, an exact input — and none of the three has an honest value
 * for "this phone was approved"; making them nullable would have turned every one of its NOT NULLs
 * into a maybe, on the table whose whole purpose is that it can be trusted.
 *
 * What it copies is the discipline: a `seq` that orders (`at` filters — two rows land in the same
 * millisecond, and a clock can be set back), a ULID minted by the domain, and triggers that refuse
 * `UPDATE` always and `DELETE` inside the ninety-day floor.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(),
    /** What the event is about — the device id, or the permission rule id. */
    subjectId: text('subject_id').notNull(),
    /** Recognisable label of the subject, so the trail reads without a second query. */
    subjectLabel: text('subject_label').notNull(),
    ...trailColumns,
  },
  (table) => [
    ...keysetIndexes('audit_events', table, { name: 'subject_id', column: table.subjectId }),
    // The retention purge takes the oldest rows before its cutoff, one batch at a time.
    index('audit_events_at_idx').on(table.at),
    check(
      'audit_events_kind_known',
      sql`${table.kind} IN ('device.registered', 'device.approved', 'device.revoked', 'device.expired', 'permission.ruleGranted', 'permission.ruleRevoked')`,
    ),
  ],
);
