import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * That **we** opened a conversation of Claude: `session_origins`.
 *
 * Provenance, not content. The transcript itself stays in Claude's JSONL and is never copied here
 * — two sources of truth for one conversation diverge. What the SDK cannot say, and this row does,
 * is that a conversation was begun by this backend, for whom, and where; without it the history
 * could not tell ours from the editor's, and a resume could not know whether it may write into the
 * file or has to fork it (docs/architecture/backend/05-persistence.md).
 *
 * The primary key is the id of the conversation in Claude's store, a UUID minted by us and handed
 * to the SDK, so a second record of the same conversation is a conflict and never a second row.
 * Its owner is `session`, which writes it before anything is spawned; `transcript` reads it.
 */
export const sessionOrigins = pgTable(
  'session_origins',
  {
    claudeSessionId: text('claude_session_id').primaryKey(),
    /** Our id for the live session that opened it. */
    sessionId: text('session_id').notNull(),
    userId: text('user_id').notNull(),
    workspacePath: text('workspace_path').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('session_origins_session_id_idx').on(table.sessionId)],
);
