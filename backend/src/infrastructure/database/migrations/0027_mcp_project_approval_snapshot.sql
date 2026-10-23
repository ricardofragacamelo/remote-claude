-- `mcp_project_approvals` gains `snapshot` (plan 13, B-28, D-80): what the entry looked like at the
-- moment of an `approved` decision — `null` for a `rejected` one, and for any row already written
-- before this column existed. Nothing here needed a column before: a `changed` entry (D-11) could
-- only be *told* it no longer matches what was approved, never shown what that was.
--
-- Additive and nullable: nothing backfills, and a row with no snapshot degrades to that same older
-- behaviour — "it changed", with no comparison beside it, exactly as before this migration.
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

ALTER TABLE "mcp_project_approvals" ADD COLUMN IF NOT EXISTS "snapshot" jsonb;

-- Reversal plan:
--   ALTER TABLE "mcp_project_approvals" DROP COLUMN "snapshot";
