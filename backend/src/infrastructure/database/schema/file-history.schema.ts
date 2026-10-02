import { sql } from 'drizzle-orm';
import { bigint, check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * The `file_history_entries` table: the metadata of the local history (plan 07, F8 · D-17).
 *
 * **No column of contents.** A kept version is a blob on the backend's disk, named by `hash`, for the
 * reason the undo's snapshots are: a database that grows with somebody's repository. The same
 * contents kept ten times are one blob and ten rows.
 *
 * Not a trail — the purge removes rows by path, by age and by the total of the blobs — so no trigger
 * guards it; the fact that the person saved, deleted or restored lives in `audit_events`. The id is
 * a ULID minted by the domain and `seq` orders, as everywhere two rows can land in one millisecond.
 * `created_at` is stamped by the application's clock, because the retention is counted from it.
 */
export const fileHistoryEntries = pgTable(
  'file_history_entries',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    /** The real path — the subject. */
    path: text('path').notNull(),
    /** Relative to the folder of the write. */
    label: text('label').notNull(),
    entryKind: text('entry_kind').notNull(),
    /** SHA-256 in hex, of a file always; `NULL` for a folder. */
    hash: text('hash'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    reason: text('reason').notNull(),
    kept: text('kept').notNull(),
    batchId: text('batch_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    /** What orders the entries: two land in one millisecond, and a clock can be set back. */
    seq: bigint('seq', { mode: 'number' }).notNull().generatedAlwaysAsIdentity(),
  },
  (table) => [
    // The versions of one path, newest first.
    index('file_history_entries_path_seq_idx').on(table.path, table.seq.desc()),
    // The entries under a folder: a prefix `LIKE`, which only a pattern index serves.
    index('file_history_entries_path_prefix_idx').on(table.path.op('text_pattern_ops')),
    index('file_history_entries_batch_id_idx').on(table.batchId),
    index('file_history_entries_created_at_idx').on(table.createdAt),
    index('file_history_entries_hash_idx').on(table.hash),
    check(
      'file_history_entries_entry_kind_known',
      sql`${table.entryKind} IN ('file', 'directory')`,
    ),
    check(
      'file_history_entries_reason_known',
      sql`${table.reason} IN ('save', 'delete', 'restore', 'upload')`,
    ),
    check('file_history_entries_kept_known', sql`${table.kept} IN ('yes', 'tooLarge')`),
    check(
      'file_history_entries_shape',
      sql`(${table.entryKind} = 'file' AND ${table.hash} IS NOT NULL AND ${table.sizeBytes} IS NOT NULL) OR (${table.entryKind} = 'directory' AND ${table.hash} IS NULL AND ${table.sizeBytes} IS NULL AND ${table.kept} = 'yes')`,
    ),
    check(
      'file_history_entries_hash_hex',
      sql`${table.hash} IS NULL OR ${table.hash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'file_history_entries_size_not_negative',
      sql`${table.sizeBytes} IS NULL OR ${table.sizeBytes} >= 0`,
    ),
    check(
      'file_history_entries_batch_of_delete',
      sql`(${table.reason} = 'delete') = (${table.batchId} IS NOT NULL)`,
    ),
    check(
      'file_history_entries_directory_of_delete',
      sql`${table.entryKind} = 'file' OR ${table.reason} = 'delete'`,
    ),
  ],
);
