-- What the undo reaches, and the fact of the trail that it happened (plan 04, F4).
--
-- Three changes, one reason each:
--
--   * `claude_session_id` on both halves of the journal. A conversation of ours continued in place
--     opens a **new** live session on the **same** conversation, and the undo points recorded by the
--     sessions before it belong to that conversation too — keying the reach by the live session
--     alone would lose them at every resume (the other half of S-59). Nullable: the rows written
--     before this migration name no conversation, and are reached by their own session only.
--   * `session_file_states.hash` becomes nullable. `NULL` says the session's own undo **removed**
--     the file — it created it in the turn that was undone. It is still how the session left the
--     path, and it has to be a baseline too: without it, a second undo to an earlier point would
--     read a missing file as somebody else's doing.
--   * `audit_events.details`, and the kind `session.filesRewound`. An undo changes the disk, and a
--     change to the disk that leaves no trace is what the trail exists to prevent (B-20). The
--     details are the point and the paths — never the contents of a file, never a message.
--
-- Reversal plan:
--   ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_kind_known";
--   ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_kind_known"
--     CHECK ("kind" IN ('device.registered', 'device.approved', 'device.revoked', 'device.expired',
--       'permission.ruleGranted', 'permission.ruleRevoked', 'session.resumed', 'session.forked'));
--   ALTER TABLE "audit_events" DROP COLUMN "details";
--   UPDATE "session_file_states" SET "hash" = '' WHERE "hash" IS NULL;
--   ALTER TABLE "session_file_states" ALTER COLUMN "hash" SET NOT NULL;
--   DROP INDEX "session_file_states_claude_session_id_idx";
--   ALTER TABLE "session_file_states" DROP COLUMN "claude_session_id";
--   DROP INDEX "turn_file_checkpoints_claude_session_id_idx";
--   ALTER TABLE "turn_file_checkpoints" DROP COLUMN "claude_session_id";
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

ALTER TABLE "turn_file_checkpoints" ADD COLUMN IF NOT EXISTS "claude_session_id" text;
CREATE INDEX IF NOT EXISTS "turn_file_checkpoints_claude_session_id_idx"
  ON "turn_file_checkpoints" ("claude_session_id");

ALTER TABLE "session_file_states" ADD COLUMN IF NOT EXISTS "claude_session_id" text;
ALTER TABLE "session_file_states" ALTER COLUMN "hash" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "session_file_states_claude_session_id_idx"
  ON "session_file_states" ("claude_session_id");

ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "details" jsonb;
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
    'session.filesRewound'
  ));
