import { boolean, check, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { auditColumns } from './columns';

/**
 * The `workspace_folders` table: the folders a user opened — the recent list and the folder tabs
 * in one row per folder ([06 · D-14](../../../../../docs/plans/06-workbench/decisions.md)).
 *
 * A folder and not a root: `workspaces` says which root was used and stays as it is. Metadata
 * only — a path and when, never a listing and never a file.
 *
 * The primary key is `(user_id, path)`, like `workspaces` and for the same reason: that pair **is**
 * the identity, so opening the same folder twice — or from two windows at once — updates a row
 * instead of adding one (plan 06, S-35, S-46). It is also the index every query reads, since every
 * query is "the folders of one user".
 *
 * `last_opened_at` is null for a folder taken off the recent list while its tab is open, and
 * `tab_position` is null while its tab is closed; a row with neither is not kept, and the database
 * says so.
 */
export const workspaceFolders = pgTable(
  'workspace_folders',
  {
    userId: text('user_id').notNull(),
    /** The real path of the folder. */
    path: text('path').notNull(),
    rootPath: text('root_path').notNull(),
    lastOpenedAt: timestamp('last_opened_at', { withTimezone: true }),
    isPinned: boolean('is_pinned').notNull().default(false),
    tabPosition: integer('tab_position'),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ name: 'workspace_folders_pkey', columns: [table.userId, table.path] }),
    check(
      'workspace_folders_recent_or_open',
      sql`${table.lastOpenedAt} IS NOT NULL OR ${table.tabPosition} IS NOT NULL`,
    ),
    check(
      'workspace_folders_pinned_is_recent',
      sql`NOT ${table.isPinned} OR ${table.lastOpenedAt} IS NOT NULL`,
    ),
    check('workspace_folders_tab_position_positive', sql`${table.tabPosition} >= 0`),
  ],
);
