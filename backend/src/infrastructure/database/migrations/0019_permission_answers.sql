-- What a person answered to a question of Claude (`AskUserQuestion`), with the request it answered
-- (plan 24, D-12).
--
-- A question is a permission request like any other, and `permission_requests` is where its history
-- already lives: who answered, from where, when. What was missing is **what** — the options chosen
-- and the free answer, per question, as the product carries them (`questionId`, `selected`,
-- `other`), never the SDK's string joined by ", ". It is the source the `GET` of a request's state
-- and the history of a reopened session read the answers from, matched by `tool_use_id`.
--
-- Nullable, with no default and no backfill: a request that is not a question has no answers, and a
-- row written before this file was a request whose answers were never recorded — `NULL` says exactly
-- that. The trail's decision entry keeps its own copy, in its `input`.
--
-- Reversal plan:
--   ALTER TABLE "permission_requests" DROP COLUMN IF EXISTS "answers";
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

ALTER TABLE "permission_requests" ADD COLUMN IF NOT EXISTS "answers" jsonb;

-- The history of a session reads the questions it asked by the tool call, and never scanned the
-- table by it before.
CREATE INDEX IF NOT EXISTS "permission_requests_tool_use_id_idx"
  ON "permission_requests" ("tool_use_id");
