import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * The `notifications` table: the history of each user's notification centre (06 · D-17).
 *
 * A key and its parameters — never the content of a conversation, never a command. Kept thirty
 * days and at most two hundred per user; "read" lives here, so it follows the user between devices.
 *
 * The id is a ULID minted by the domain, like the trails'; `seq` is what the pages are cut on, for
 * the reason it is there too — two entries land in the same millisecond. `(user_id, client_id)` is
 * unique: it is what makes a client sending the same entry twice keep one. `created_at` is stamped
 * by the application's clock, never by a default, because the retention is counted from it.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    seq: bigint('seq', { mode: 'number' }).notNull().generatedAlwaysAsIdentity(),
    userId: text('user_id').notNull(),
    clientId: text('client_id').notNull(),
    severity: text('severity').notNull(),
    messageKey: text('message_key').notNull(),
    params: jsonb('params').$type<Record<string, string | number | boolean>>().notNull(),
    count: integer('count').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('notifications_user_id_client_id_key').on(table.userId, table.clientId),
    index('notifications_user_id_seq_idx').on(table.userId, table.seq.desc()),
    index('notifications_created_at_idx').on(table.createdAt),
    check('notifications_severity_known', sql`${table.severity} IN ('info', 'warning', 'error')`),
    check('notifications_count_positive', sql`${table.count} >= 1`),
  ],
);
