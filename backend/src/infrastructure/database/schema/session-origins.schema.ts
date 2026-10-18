import { index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * That **we** opened a conversation of an engine: `session_origins`.
 *
 * Provenance, not content. The transcript itself stays in the engine's own store and is never
 * copied here — two sources of truth for one conversation diverge. What the engine cannot say, and
 * this row does, is that a conversation was begun by this backend, for whom, and where; without it
 * the history could not tell ours from the editor's, and a resume could not know whether it may
 * write into the file or has to fork it (docs/architecture/backend/05-persistence.md).
 *
 * The primary key is `(engine, conversation_id)`, minted by us and handed to the engine, so a
 * second record of the same conversation is a conflict and never a second row. Its owner is
 * `session`, which writes it before anything is spawned; `transcript` reads it.
 */
export const sessionOrigins = pgTable(
  'session_origins',
  {
    /** The engine of the conversation (plan 28, B-11) — written by the code, never defaulted. */
    engine: text('engine').notNull(),
    /** The id of the conversation in its engine's store. */
    conversationId: text('conversation_id').notNull(),
    /** Our id for the live session that opened it. */
    sessionId: text('session_id').notNull(),
    userId: text('user_id').notNull(),
    workspacePath: text('workspace_path').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ name: 'session_origins_pkey', columns: [table.engine, table.conversationId] }),
    index('session_origins_session_id_idx').on(table.sessionId),
  ],
);
