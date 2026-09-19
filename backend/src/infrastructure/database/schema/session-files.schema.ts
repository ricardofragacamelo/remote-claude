import { bigint, index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * How the session left each file it wrote: `session_file_states`.
 *
 * Written by the `PostToolUse` hook, after the write, because the hash only exists then. The row
 * is **overwritten** on every further write to the same path — which is precisely why it cannot
 * live in the audit trail, whose trigger aborts `UPDATE`. One is "what resulted, now"; the other
 * is "what happened, for ever", and a single table cannot be both
 * ([B-46](../../../../../docs/plans/01-live-session/F3-audit.md)).
 *
 * Its owner is `session`, and its life is the session's: it exists so that the undo of a later
 * plan can tell "how the session left this file" from "somebody edited it afterwards" — the
 * distinction `rewindFiles()` cannot make, and overwrites in silence.
 */
export const sessionFileStates = pgTable(
  'session_file_states',
  {
    sessionId: text('session_id').notNull(),
    path: text('path').notNull(),
    /** SHA-256 of the contents the session left behind. */
    hash: text('hash').notNull(),
    /** Modification time as the filesystem reported it right after the write. */
    mtime: timestamp('mtime', { withTimezone: true }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ name: 'session_file_states_pkey', columns: [table.sessionId, table.path] }),
    index('session_file_states_session_id_idx').on(table.sessionId),
  ],
);

/**
 * What a file looked like before the turn touched it: `turn_file_checkpoints`.
 *
 * The other half of undo. `sessionFileStates` says how the session left a file; this says how the
 * file was **before**, so a revert has something to restore. It cannot come from the CLI's own
 * checkpoint store: `rewindFiles()` takes no file filter, so "revert some and preserve the rest"
 * only exists if the snapshot is ours.
 *
 * Keyed by `(session_id, prompt_id, path)`. `prompt_id` comes from `BaseHookInput` on every hook —
 * "UUID correlating a user prompt with all subsequent events until the next prompt" — so the turn
 * a snapshot belongs to is known without reading the transcript.
 *
 * The **content is not here.** The row carries metadata and points at a blob on disk: a snapshot
 * of a large file in PostgreSQL is a database that grows with somebody's repository.
 */
export const turnFileCheckpoints = pgTable(
  'turn_file_checkpoints',
  {
    sessionId: text('session_id').notNull(),
    promptId: text('prompt_id').notNull(),
    path: text('path').notNull(),

    /**
     * Whether the file existed before the turn touched it.
     *
     * `absent` is not an absence of information: it is what lets undo **delete** a file the turn
     * created, instead of leaving it behind because there was nothing to restore.
     */
    existedBefore: text('existed_before').notNull(),

    /** Where the previous contents were stored, or `null` when nothing was stored. */
    blobPath: text('blob_path'),

    /** SHA-256 of the previous contents, or `null` when the file was absent or too large. */
    hash: text('hash'),

    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),

    /**
     * Whether undo can promise this path.
     *
     * `false` for a file above the snapshot limit. The undo has to know it cannot promise that
     * one, rather than discovering it at the moment somebody asked for their work back.
     */
    restorable: text('restorable').notNull(),

    /** The prompt that opened the turn, which is the label of the undo point in the UI. */
    promptText: text('prompt_text'),

    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      name: 'turn_file_checkpoints_pkey',
      columns: [table.sessionId, table.promptId, table.path],
    }),
    // The purge walks by age, and undo reads one turn at a time.
    index('turn_file_checkpoints_captured_at_idx').on(table.capturedAt),
    index('turn_file_checkpoints_session_id_prompt_id_idx').on(table.sessionId, table.promptId),
  ],
);
