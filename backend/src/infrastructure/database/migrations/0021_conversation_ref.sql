-- The conversation of a session is `{ engine, conversation_id }`, and no longer the id of one
-- engine's store (plan 28, B-11; ADR-025).
--
-- Three tables named a conversation by `claude_session_id`: the provenance (`session_origins`) and
-- the two of the undo (`session_file_states`, `turn_file_checkpoints`). Each gains the engine and the
-- id of the conversation, copied from the old column for every row written before this file: every
-- one of them is a conversation of the only engine there was. The old column stays, written beside
-- the new ones, until the window of the previous protocol closes (plan 28, F7, B-47); a migration of
-- its own drops it then. The default of `session_origins.engine` exists only for the copy, and is
-- dropped at once: the code always says which engine. In the two tables of the undo, the engine and
-- the id are null together, as the old column was, for a row written before `0013`.
--
-- Idempotent: every column and index is created only if missing, and the copy only fills what is
-- still empty — run twice, it neither duplicates nor overwrites (S-34).
--
-- Reversal plan:
--   DROP INDEX IF EXISTS "session_origins_conversation_idx";
--   DROP INDEX IF EXISTS "session_file_states_conversation_idx";
--   DROP INDEX IF EXISTS "turn_file_checkpoints_conversation_idx";
--   ALTER TABLE "session_origins" DROP COLUMN IF EXISTS "engine", DROP COLUMN IF EXISTS "conversation_id";
--   ALTER TABLE "session_file_states" DROP COLUMN IF EXISTS "engine", DROP COLUMN IF EXISTS "conversation_id";
--   ALTER TABLE "turn_file_checkpoints" DROP COLUMN IF EXISTS "engine", DROP COLUMN IF EXISTS "conversation_id";
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

ALTER TABLE "session_origins" ADD COLUMN IF NOT EXISTS "engine" text NOT NULL DEFAULT 'claude';
ALTER TABLE "session_origins" ADD COLUMN IF NOT EXISTS "conversation_id" text;
UPDATE "session_origins" SET "conversation_id" = "claude_session_id" WHERE "conversation_id" IS NULL;
ALTER TABLE "session_origins" ALTER COLUMN "conversation_id" SET NOT NULL;
ALTER TABLE "session_origins" ALTER COLUMN "engine" DROP DEFAULT;
CREATE UNIQUE INDEX IF NOT EXISTS "session_origins_conversation_idx"
  ON "session_origins" ("engine", "conversation_id");

ALTER TABLE "session_file_states" ADD COLUMN IF NOT EXISTS "engine" text;
ALTER TABLE "session_file_states" ADD COLUMN IF NOT EXISTS "conversation_id" text;
UPDATE "session_file_states" SET "engine" = 'claude', "conversation_id" = "claude_session_id"
  WHERE "conversation_id" IS NULL AND "claude_session_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "session_file_states_conversation_idx"
  ON "session_file_states" ("engine", "conversation_id");

ALTER TABLE "turn_file_checkpoints" ADD COLUMN IF NOT EXISTS "engine" text;
ALTER TABLE "turn_file_checkpoints" ADD COLUMN IF NOT EXISTS "conversation_id" text;
UPDATE "turn_file_checkpoints" SET "engine" = 'claude', "conversation_id" = "claude_session_id"
  WHERE "conversation_id" IS NULL AND "claude_session_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "turn_file_checkpoints_conversation_idx"
  ON "turn_file_checkpoints" ("engine", "conversation_id");

-- The count is checked here, in the same transaction: a row whose conversation did not come across
-- fails the migration, and nothing of it is applied (R-07).
DO $$
DECLARE
  lost bigint;
BEGIN
  SELECT
    (SELECT count(*) FROM "session_origins" WHERE "conversation_id" IS DISTINCT FROM "claude_session_id")
    + (SELECT count(*) FROM "session_file_states" WHERE "conversation_id" IS DISTINCT FROM "claude_session_id")
    + (SELECT count(*) FROM "turn_file_checkpoints" WHERE "conversation_id" IS DISTINCT FROM "claude_session_id")
  INTO lost;
  IF lost > 0 THEN
    RAISE EXCEPTION 'conversation_ref: % rows did not keep their conversation', lost;
  END IF;
END $$;
