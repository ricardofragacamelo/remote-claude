-- The local history: `file_history_entries`, and `file.restored` in the trail (plan 07, F8).
--
-- Every write of the person's that loses contents — a save, a delete that asked for the history, a
-- restore, an upload that replaces — keeps the version it is about to lose, **before** the write
-- (07 · D-17). This table holds the metadata of each one and **no column of contents**: those go to
-- a blob on the backend's disk, named by its SHA-256, for the reason the undo's snapshot store keeps
-- them out of PostgreSQL — a database that grows with somebody's repository (ADR-015, backend/05).
--
-- It is not a trail. The purge removes rows — past the versions per path, past the retention and
-- past the total of the distinct blobs — and the fact that matters for good, that the person
-- saved, deleted or restored, is already in `audit_events`. So no trigger refuses `DELETE` here.
--
-- Columns:
--   * `id` — a ULID minted by the domain; `seq` — what the pages and the purge are ordered by,
--     because two entries land in the same millisecond and a clock can be set back;
--   * `user_id` — who wrote over the version: the `sub`, the one thing the server knows of a person;
--   * `path` — the real path, the subject (as in the trail); `label` — relative to the folder of
--     the write, how it was named then;
--   * `entry_kind` — `file`, or `directory` for a folder of a delete, with no blob, so the undo
--     re-creates even an empty one;
--   * `hash`, `size_bytes` — of a file, always (a version too large to keep still says which it
--     was); `NULL` for a folder;
--   * `reason` — `save`, `delete`, `restore`, `upload`; `kept` — `yes`, or `tooLarge` past the
--     snapshot ceiling, with no blob;
--   * `batch_id` — what joins the items of one delete, so its undo restores them all;
--   * `created_at` — stamped by the application's clock, never by a default: the retention is
--     counted from it.
--
-- Indexes, each with the query it serves: `(path, seq DESC)` for the versions of one path, newest
-- first; `path text_pattern_ops` for the entries under a folder (`LIKE '<folder>/%'`, which the
-- default collation's index cannot serve); `batch_id` for a delete's items; `created_at` for the
-- retention; `hash` for "is this blob still named?", which the per-path trim and the sweep ask.
--
-- The trail: the CHECK of `audit_events` is re-created with every kind, `file.downloaded` (07 · F7,
-- migration `0017`) and `file.restored` included. `0016` and `0017` are not edited — once applied, a
-- migration is history (docs/architecture/backend/05-persistence.md#migrations).
--
-- Reversal plan:
--   DROP TABLE "file_history_entries";
--   The blobs under RC_FILES_HISTORY_DIR go with it: `rm -r "$RC_FILES_HISTORY_DIR"`.
--   The CHECK: rows of `file.restored` cannot be removed inside the retention floor (the trigger
--   refuses), so reversing means keeping this CHECK. On a database with none of them:
--   ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_kind_known";
--   ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_kind_known"
--     CHECK ("kind" IN ('device.registered', 'device.approved', 'device.revoked', 'device.expired',
--       'permission.ruleGranted', 'permission.ruleRevoked', 'session.resumed', 'session.forked',
--       'session.filesRewound', 'file.created', 'file.written', 'file.moved', 'file.copied',
--       'file.deleted', 'file.failed', 'file.downloaded'));
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "audit_events_kind_known";
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_kind_known"
  CHECK ("kind" IN (
    'device.registered',
    'device.approved',
    'device.revoked',
    'device.expired',
    'permission.ruleGranted',
    'permission.ruleRevoked',
    'session.resumed',
    'session.forked',
    'session.filesRewound',
    'file.created',
    'file.written',
    'file.moved',
    'file.copied',
    'file.deleted',
    'file.failed',
    'file.downloaded',
    'file.restored'
  ));

CREATE TABLE IF NOT EXISTS "file_history_entries" (
  "id" text PRIMARY KEY NOT NULL,
  "seq" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "user_id" text NOT NULL,
  "path" text NOT NULL,
  "label" text NOT NULL,
  "entry_kind" text NOT NULL,
  "hash" text,
  "size_bytes" bigint,
  "reason" text NOT NULL,
  "kept" text NOT NULL,
  "batch_id" text,
  "created_at" timestamptz NOT NULL,
  CONSTRAINT "file_history_entries_entry_kind_known" CHECK ("entry_kind" IN ('file', 'directory')),
  CONSTRAINT "file_history_entries_reason_known"
    CHECK ("reason" IN ('save', 'delete', 'restore', 'upload')),
  CONSTRAINT "file_history_entries_kept_known" CHECK ("kept" IN ('yes', 'tooLarge')),
  -- A file always says which contents it was; a folder has none, and is always "kept".
  CONSTRAINT "file_history_entries_shape" CHECK (
    ("entry_kind" = 'file' AND "hash" IS NOT NULL AND "size_bytes" IS NOT NULL)
    OR ("entry_kind" = 'directory' AND "hash" IS NULL AND "size_bytes" IS NULL AND "kept" = 'yes')
  ),
  -- The hash names a blob on disk: hex only, so it can never be read as a path.
  CONSTRAINT "file_history_entries_hash_hex" CHECK ("hash" IS NULL OR "hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "file_history_entries_size_not_negative"
    CHECK ("size_bytes" IS NULL OR "size_bytes" >= 0),
  -- Only a delete has a batch, and only a delete keeps a folder.
  CONSTRAINT "file_history_entries_batch_of_delete"
    CHECK (("reason" = 'delete') = ("batch_id" IS NOT NULL)),
  CONSTRAINT "file_history_entries_directory_of_delete"
    CHECK ("entry_kind" = 'file' OR "reason" = 'delete')
);

CREATE INDEX IF NOT EXISTS "file_history_entries_path_seq_idx"
  ON "file_history_entries" ("path", "seq" DESC);

CREATE INDEX IF NOT EXISTS "file_history_entries_path_prefix_idx"
  ON "file_history_entries" ("path" text_pattern_ops);

CREATE INDEX IF NOT EXISTS "file_history_entries_batch_id_idx"
  ON "file_history_entries" ("batch_id");

CREATE INDEX IF NOT EXISTS "file_history_entries_created_at_idx"
  ON "file_history_entries" ("created_at");

CREATE INDEX IF NOT EXISTS "file_history_entries_hash_idx"
  ON "file_history_entries" ("hash");
