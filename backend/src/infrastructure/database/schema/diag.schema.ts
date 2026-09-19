import { check, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { auditColumns } from './columns';

/**
 * The `diag_sessions` table: the counter behind `diag.ping`.
 *
 * It holds no session of Claude. A live session is process state — a subprocess, a `for await` and
 * a pending promise — and it dies with the process, so it is held in memory and never here
 * (docs/architecture/backend/06-realtime.md). What this table keeps is the diagnostic round trip.
 *
 * It is **not** the `DiagSession` entity: they change for different reasons, and the mapper in the
 * adapter is what keeps that true. See docs/architecture/backend/05-persistence.md.
 *
 * The primary key is a ULID in a `text` column rather than a `uuid` with a database default: the
 * identity is minted by the domain's `IdGenerator`, so a default on this side would mean the
 * database decides who the entity is. `timestamptz` everywhere, never a timestamp without zone.
 */
export const diagSessions = pgTable(
  'diag_sessions',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
    lastPingedAt: timestamp('last_pinged_at', { withTimezone: true }).notNull(),
    pingCount: integer('ping_count').notNull().default(0),
    ...auditColumns,
  },
  (table) => [
    index('diag_sessions_owner_id_idx').on(table.ownerId),
    check('diag_sessions_ping_count_non_negative', sql`${table.pingCount} >= 0`),
  ],
);
