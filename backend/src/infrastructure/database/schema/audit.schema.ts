import { bigint, check, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { invocationColumns } from './columns';

/**
 * The `audit_entries` table.
 *
 * It breaks two of the schema conventions, and both on purpose.
 *
 * **It has a `seq` beside its `id`.** The identifier stays the primary key; the sequence exists
 * because
 * the paginated query needs an ordering that is total and monotonic, and `at` is neither — two
 * entries land in the same millisecond, and the clock of the machine can be set back. `at`
 * filters, `seq` orders, and the indexes follow the ordering rather than the timestamp.
 *
 * The identifier is a ULID in a `text` column rather than a `uuid` with a database default, for
 * the same reason the other tables here do it: the id is minted by the domain's `IdGenerator`, so
 * a default on this side would mean the database decides who the entry is.
 *
 * **It is protected by a trigger, not by a convention.** See the migration: `UPDATE` always
 * aborts, `DELETE` aborts inside the ninety-day floor. That makes append-only a property of the
 * database instead of a promise of the code — the one that survives a bug of ours, a distracted
 * migration or a `DELETE` typed by hand.
 *
 * See docs/architecture/backend/05-persistence.md#a-trilha-de-auditoria.
 */
export const auditEntries = pgTable(
  'audit_entries',
  {
    id: text('id').primaryKey(),
    seq: bigint('seq', { mode: 'number' }).notNull().generatedAlwaysAsIdentity(),
    ...invocationColumns,
    decision: text('decision').notNull(),
    deviceId: text('device_id'),
    ip: text('ip'),
    at: timestamp('at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Keyset pagination is descending over `seq`, scoped by user or by session. The indexes match
    // the ordering, because an index that matches the filter and not the order sorts every page.
    index('audit_entries_user_id_seq_idx').on(table.userId, table.seq.desc()),
    index('audit_entries_session_id_seq_idx').on(table.sessionId, table.seq.desc()),
    // One record per invocation **per fact**. A redelivered tool call writes `recorded` again and
    // collides with the entry it repeats, so the trail never claims a command ran twice; a
    // permission decision about the same invocation is a different fact and gets its own row.
    // `NULLS DISTINCT` is the default and it is the point: `tool_use_id` is nullable because the
    // SDK does not always give one, and under that rule two rows without an id do not collide.
    uniqueIndex('audit_entries_session_id_tool_use_id_decision_key').on(
      table.sessionId,
      table.toolUseId,
      table.decision,
    ),
    check(
      'audit_entries_decision_known',
      sql`${table.decision} IN ('recorded', 'allowed', 'denied')`,
    ),
  ],
);
