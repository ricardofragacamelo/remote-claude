import { bigint, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * The `persisted_notices` table: a `session.notice` kept outside any engine's own transcript
 * (Plan 27, F7, D-15) — the only source for a notice the engine never writes anywhere else (an
 * agent hook's own warning, measured — the engine's own adapter decides which of its message
 * variants this covers).
 *
 * Keyed by `(engine, conversation_id, notice_id)` — never one engine's own id alone (plan 28) —
 * with a unique index so the same notice recorded twice, or twice at once, leaves one row. `seq` orders a
 * conversation's own notices for a merge that has to pick a position; `recorded_at` is the
 * application's clock at the moment of writing, read back as the notice's own `at` when it carries
 * none (every live notice).
 */
export const persistedNotices = pgTable(
  'persisted_notices',
  {
    id: text('id').primaryKey(),
    seq: bigint('seq', { mode: 'number' }).notNull().generatedAlwaysAsIdentity(),
    engine: text('engine').notNull(),
    conversationId: text('conversation_id').notNull(),
    noticeId: text('notice_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('persisted_notices_engine_conversation_notice_key').on(
      table.engine,
      table.conversationId,
      table.noticeId,
    ),
    index('persisted_notices_conversation_seq_idx').on(
      table.engine,
      table.conversationId,
      table.seq,
    ),
  ],
);
