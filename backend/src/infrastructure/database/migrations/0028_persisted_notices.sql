-- `persisted_notices`: a `session.notice` kept outside any engine's own transcript (Plan 27, F7, D-15).
--
-- Some notices (an agent hook's own warning, measured) leave no trace at all in the engine's
-- transcript — not even an empty marker, unlike a compaction boundary. Without a store of our own,
-- that notice is gone the moment a conversation is read back cold, even though it was shown live.
-- This table is not a copy of the transcript (05-persistence.md's own rule): the engine never
-- carries this content anywhere else, so this is its only source, not a second one.
--
-- Keyed by `(engine, conversation_id, notice_id)` — engine-neutral by construction (plan 28), never
-- one engine's own id alone — with a unique index so the same notice recorded twice, or twice at once, leaves one
-- row (idempotent: S-110, S-111). `payload` is the `session.notice` contract payload, whole, in
-- `jsonb` — the schema's own 4 000-character ceiling on `text` (D-13) already bounds it; nothing new
-- to enforce here. `recorded_at` is the application's clock at the moment it was written, read back
-- as the notice's own `at` when the notice itself carries none (live notices never do; only a
-- historical read synthesizes `at`, the same convention `historicalSystemEvents` already follows).
--
-- Reversal plan:
--   DROP TABLE "persisted_notices";
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

CREATE TABLE IF NOT EXISTS "persisted_notices" (
  "id" text PRIMARY KEY NOT NULL,
  "seq" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "engine" text NOT NULL,
  "conversation_id" text NOT NULL,
  "notice_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "recorded_at" timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "persisted_notices_engine_conversation_notice_key"
  ON "persisted_notices" ("engine", "conversation_id", "notice_id");

CREATE INDEX IF NOT EXISTS "persisted_notices_conversation_seq_idx"
  ON "persisted_notices" ("engine", "conversation_id", "seq");
