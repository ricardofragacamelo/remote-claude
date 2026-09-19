-- What the session did to the disk, and what the disk looked like before.
--
-- Two tables, and they are deliberately **not** the audit trail:
--
--   * `session_file_states` is overwritten on every further write to the same path, and the trail's
--     trigger aborts UPDATE. Putting them together would break one guarantee or the other.
--   * their owner is `session` and their life is the session's; the trail is for ever.
--
-- `turn_file_checkpoints` stores metadata and points at a blob on disk. Snapshotting file contents
-- into PostgreSQL would make the database grow with somebody's repository, and the reference
-- measurement is small (the CLI's own store: 6.6 MB for 54 sessions) — small without a ceiling
-- still grows.
--
-- Reversal plan:
--   DROP TABLE "turn_file_checkpoints";
--   DROP TABLE "session_file_states";
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

CREATE TABLE IF NOT EXISTS "session_file_states" (
  "session_id" text NOT NULL,
  "path" text NOT NULL,
  "hash" text NOT NULL,
  "mtime" timestamptz NOT NULL,
  "size_bytes" bigint NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "session_file_states_pkey" PRIMARY KEY ("session_id", "path")
);

CREATE INDEX IF NOT EXISTS "session_file_states_session_id_idx"
  ON "session_file_states" ("session_id");

CREATE TABLE IF NOT EXISTS "turn_file_checkpoints" (
  "session_id" text NOT NULL,
  "prompt_id" text NOT NULL,
  "path" text NOT NULL,
  "existed_before" text NOT NULL,
  "blob_path" text,
  "hash" text,
  "size_bytes" bigint NOT NULL,
  "restorable" text NOT NULL,
  "prompt_text" text,
  "captured_at" timestamptz NOT NULL,
  CONSTRAINT "turn_file_checkpoints_pkey" PRIMARY KEY ("session_id", "prompt_id", "path"),
  CONSTRAINT "turn_file_checkpoints_existed_before_known"
    CHECK ("existed_before" IN ('present', 'absent')),
  CONSTRAINT "turn_file_checkpoints_restorable_known"
    CHECK ("restorable" IN ('yes', 'tooLarge', 'unreadable'))
);

CREATE INDEX IF NOT EXISTS "turn_file_checkpoints_captured_at_idx"
  ON "turn_file_checkpoints" ("captured_at");

CREATE INDEX IF NOT EXISTS "turn_file_checkpoints_session_id_prompt_id_idx"
  ON "turn_file_checkpoints" ("session_id", "prompt_id");
