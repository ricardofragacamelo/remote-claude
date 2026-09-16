import { check, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * The `sessions` table.
 *
 * It is **not** the `Session` entity: they change for different reasons, and the mapper in the
 * adapter is what keeps that true. See docs/architecture/backend/05-persistence.md.
 *
 * The primary key is a ULID in a `text` column rather than a `uuid` with a database default: the
 * identity is minted by the domain's `IdGenerator`, so a default on this side would mean the
 * database decides who the entity is. `timestamptz` everywhere, never a timestamp without zone.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
    lastPingedAt: timestamp('last_pinged_at', { withTimezone: true }).notNull(),
    pingCount: integer('ping_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sessions_owner_id_idx').on(table.ownerId),
    check('sessions_ping_count_non_negative', sql`${table.pingCount} >= 0`),
  ],
);
