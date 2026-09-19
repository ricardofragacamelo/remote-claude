import { jsonb, text, timestamp } from 'drizzle-orm/pg-core';

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
