-- The window of the previous protocol closes (plan 28, D-08, F7, B-47): `claude_session_id` drops
-- from the three tables migration `0021` copied it into `(engine, conversation_id)` — the pair every
-- row has carried beside it since then.
--
-- `session_origins` was keyed by `claude_session_id` itself. Its primary key becomes
-- `(engine, conversation_id)`, promoted from the unique index `0021` already keeps in step with it —
-- no rebuild, no row touched. `session_file_states` and `turn_file_checkpoints` only ever indexed the
-- old column beside the real key (`session_id` and `(session_id, prompt_id, path)`), so dropping it
-- there is a plain column drop.
--
-- Idempotent: the primary key is promoted only the first time — `0021` already made
-- `conversation_id` `NOT NULL`, so the index is always ready to become the key — and the second run
-- finds it already keyed by `(engine, conversation_id)` and changes nothing; every DROP is guarded by
-- IF EXISTS.
--
-- Reversal plan:
--   ALTER TABLE "session_origins" ADD COLUMN "claude_session_id" text;
--   UPDATE "session_origins" SET "claude_session_id" = "conversation_id" WHERE "engine" = 'claude';
--   -- a conversation of another engine has no id in Claude's own store to put back here.
--   ALTER TABLE "session_origins" ALTER COLUMN "claude_session_id" SET NOT NULL;
--   ALTER TABLE "session_origins" DROP CONSTRAINT "session_origins_pkey";
--   ALTER TABLE "session_origins" ADD CONSTRAINT "session_origins_pkey" PRIMARY KEY ("claude_session_id");
--   CREATE UNIQUE INDEX "session_origins_conversation_idx" ON "session_origins" ("engine", "conversation_id");
--   ALTER TABLE "session_file_states" ADD COLUMN "claude_session_id" text;
--   UPDATE "session_file_states" SET "claude_session_id" = "conversation_id" WHERE "engine" = 'claude';
--   ALTER TABLE "turn_file_checkpoints" ADD COLUMN "claude_session_id" text;
--   UPDATE "turn_file_checkpoints" SET "claude_session_id" = "conversation_id" WHERE "engine" = 'claude';
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

DO $$
DECLARE
  current_pk_cols text[];
BEGIN
  SELECT array_agg("column_name" ORDER BY "ordinal_position")
    INTO current_pk_cols
    FROM information_schema.key_column_usage
    WHERE "table_name" = 'session_origins' AND "constraint_name" = 'session_origins_pkey';

  IF current_pk_cols = ARRAY['claude_session_id'] THEN
    ALTER TABLE "session_origins" DROP CONSTRAINT "session_origins_pkey";
    ALTER TABLE "session_origins" ADD CONSTRAINT "session_origins_pkey"
      PRIMARY KEY USING INDEX "session_origins_conversation_idx";
  END IF;
END $$;

ALTER TABLE "session_origins" DROP COLUMN IF EXISTS "claude_session_id";

DROP INDEX IF EXISTS "session_file_states_claude_session_id_idx";
ALTER TABLE "session_file_states" DROP COLUMN IF EXISTS "claude_session_id";

DROP INDEX IF EXISTS "turn_file_checkpoints_claude_session_id_idx";
ALTER TABLE "turn_file_checkpoints" DROP COLUMN IF EXISTS "claude_session_id";
