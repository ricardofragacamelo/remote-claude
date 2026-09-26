import { bigint, index, jsonb, text, timestamp } from 'drizzle-orm/pg-core';
import type { IndexBuilder } from 'drizzle-orm/pg-core';
import { desc } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * The audit columns every table carries.
 *
 * Spread into a table rather than written out again: three tables declaring the same two columns
 * is three places for them to drift, and the first thing that drifts is which of them has a
 * default. `timestamptz` always, never a timestamp without a zone.
 */
export const auditColumns = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/**
 * What identifies one invocation of a tool, in the two tables that record one.
 *
 * `audit_entries` says the tool was about to run; `permission_requests` says what was asked about
 * it. They are different facts with different lifetimes, but they name the same event — and five
 * columns written out twice is five chances for the two records of one invocation to stop lining
 * up. `user_id` is here rather than implied because every query in this schema is scoped by user
 * (D-03), and `input` is `jsonb` and never truncated: truncation is the log's job.
 */
export const invocationColumns = {
  userId: text('user_id').notNull(),
  sessionId: text('session_id').notNull(),
  /** Nullable because the SDK does not always give one. */
  toolUseId: text('tool_use_id'),
  toolName: text('tool_name').notNull(),
  /** The exact input. `jsonb`, never `json`, and never cut down. */
  input: jsonb('input').notNull(),
};

/**
 * What both append-only trails carry beside their id: a sequence, and two instants.
 *
 * **`at` filters and `seq` orders**, and the two are not interchangeable: two records land in the
 * same millisecond, and the clock of the machine can be set backwards. `at` is when the fact
 * happened and `created_at` is when the row was written, which are the same thing until the day
 * they are not.
 *
 * The identifier stays the primary key, and it is a ULID minted by the domain's `IdGenerator`: a
 * database default would mean the database decides who a record is. There is no `updated_at`,
 * because a trigger on each table aborts every `UPDATE`.
 */
export const trailColumns = {
  seq: bigint('seq', { mode: 'number' }).notNull().generatedAlwaysAsIdentity(),
  at: timestamp('at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
};

/**
 * The two keyset indexes a trail is read by: by owner, and by whatever it is a trail *of*.
 *
 * Written once because both trails read the same way and the pair drifts otherwise — and an index
 * that matches the filter but not the order sorts every page. Descending, like the query: a write
 * that arrives while somebody is paging enters **above** the window already read, never inside it.
 *
 * @param prefix the table's name, which every index of it is named after
 * @param scope the second column the trail is scoped by — the session, or the subject
 */
export function keysetIndexes(
  prefix: string,
  columns: { readonly userId: PgColumn; readonly seq: PgColumn },
  scope: { readonly name: string; readonly column: PgColumn },
): IndexBuilder[] {
  return [
    index(`${prefix}_user_id_seq_idx`).on(columns.userId, desc(columns.seq)),
    index(`${prefix}_${scope.name}_seq_idx`).on(scope.column, desc(columns.seq)),
  ];
}
