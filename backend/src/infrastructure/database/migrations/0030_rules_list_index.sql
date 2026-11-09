-- The rules management screen's listing (plan 15, F1, B-10): a cursor-stable index over every
-- status, not only the active ones.
--
-- `permission_rules_user_id_granted_at_idx` (migration of plan 03) is partial on
-- `revoked_at IS NULL` and has no `id` tiebreak — it serves the hot path (`findApplicable`,
-- `listFor`) but not a cursor page that can include revoked or disabled rows (the "Revogadas" tab,
-- D-02) or that must never repeat/skip a row sharing the same `granted_at` millisecond. This index
-- is not partial, so it serves every `status` filter the listing accepts, and ordering by
-- `(granted_at, id)` matches exactly what the cursor compares against.
--
-- Reversal plan:
--   DROP INDEX IF EXISTS "permission_rules_user_id_cursor_idx";
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

CREATE INDEX IF NOT EXISTS "permission_rules_user_id_cursor_idx"
  ON "permission_rules" ("user_id", "granted_at" DESC, "id" DESC);
