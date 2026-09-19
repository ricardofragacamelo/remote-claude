-- `sessions` becomes `diag_sessions`.
--
-- The table was born holding the walking skeleton's ping counter, at a time when that was the only
-- session there was. It is not a session of Claude and it never will be: a live session is a
-- subprocess and a pending promise, it dies with the process, and it is held in memory
-- (docs/architecture/backend/06-realtime.md). Leaving the name would have meant a table called
-- `sessions` that holds none, next to an entity called `Session` that is never written to it.
--
-- A rename and not a drop: nothing is lost, and the constraint and index follow the table so the
-- schema keeps matching what Drizzle declares. No deployed client reads this table — it is reached
-- only through `diag.ping`, whose contract does not change.
--
-- Reversal plan:
--   ALTER TABLE "diag_sessions" RENAME TO "sessions";
--   ALTER INDEX "diag_sessions_owner_id_idx" RENAME TO "sessions_owner_id_idx";
--   ALTER TABLE "sessions" RENAME CONSTRAINT "diag_sessions_ping_count_non_negative"
--     TO "sessions_ping_count_non_negative";
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

ALTER TABLE "sessions" RENAME TO "diag_sessions";
ALTER INDEX "sessions_owner_id_idx" RENAME TO "diag_sessions_owner_id_idx";
ALTER TABLE "diag_sessions"
  RENAME CONSTRAINT "sessions_ping_count_non_negative" TO "diag_sessions_ping_count_non_negative";
