import { index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

import { auditColumns } from './columns';

/**
 * The `workspaces` table: metadata about roots, and nothing else.
 *
 * No file content, no listing, no tree — see docs/architecture/backend/05-persistence.md. What a
 * root *is* lives in the allowlist file, which is the source of truth and is not administrable
 * from the UI (D-02). What lives here is the part the file cannot know: that a given user reached
 * a given root, and when.
 *
 * The primary key is the pair `(user_id, root_path)` rather than a surrogate `id`, against the
 * convention and on purpose: that pair **is** the identity of the record, so recording the same
 * use twice updates a row instead of adding one (S-20). A surrogate key here would need a unique
 * index over the same two columns to say the same thing, with one more column to keep in step.
 */
export const workspaces = pgTable(
  'workspaces',
  {
    userId: text('user_id').notNull(),
    rootPath: text('root_path').notNull(),
    label: text('label').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ name: 'workspaces_pkey', columns: [table.userId, table.rootPath] }),
    // The listing is always "the roots of one user, most recent first", and that is the index it
    // reads. An index arrives with the query that justifies it, in the same migration.
    index('workspaces_user_id_last_used_at_idx').on(table.userId, table.lastUsedAt.desc()),
  ],
);
