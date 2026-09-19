-- One invocation now produces two entries, and the uniqueness has to say so.
--
-- `0003` made `(session_id, tool_use_id)` unique, which was right while the `PreToolUse` hook was
-- the only writer: a redelivered tool call must not make the trail claim the command ran twice.
-- The permission flow adds a second, different fact about the same invocation — `allowed` or
-- `denied`, by whom — and under the old index that row was silently dropped by the ON CONFLICT
-- clause. A decision that does not reach the trail is the one thing this table exists to prevent.
--
-- So the key gains `decision`. A redelivery still collides with the entry it repeats, because a
-- redelivered hook writes `recorded` exactly as the first one did; what no longer collides is a
-- record of a *different* fact.
--
-- NULLS DISTINCT stays the default and stays load-bearing: `tool_use_id` is nullable because the
-- SDK does not always give one, and under that rule rows without an id never collide.
--
-- Reversal plan:
--   DROP INDEX "audit_entries_session_id_tool_use_id_decision_key";
--   CREATE UNIQUE INDEX "audit_entries_session_id_tool_use_id_key"
--     ON "audit_entries" ("session_id", "tool_use_id") NULLS DISTINCT;
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

DROP INDEX IF EXISTS "audit_entries_session_id_tool_use_id_key";

CREATE UNIQUE INDEX IF NOT EXISTS "audit_entries_session_id_tool_use_id_decision_key"
  ON "audit_entries" ("session_id", "tool_use_id", "decision") NULLS DISTINCT;
