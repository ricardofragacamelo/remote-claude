-- The person writing to the disk from the web, in the trail (plan 07, B-16).
--
-- Until now, what wrote to the user's disk was Claude, under `canUseTool` and recorded by the
-- `PreToolUse` hook. The explorer and the editor add a second actor on the same machine, and the
-- question "who changed this file?" needs an answer the trail can give (ADR-015).
--
-- Six kinds, one fact each, recorded **before** the disk is touched:
--
--   * `file.created`, `file.written`, `file.moved`, `file.copied`, `file.deleted` — the write. The
--     subject is the real path, the label the path relative to the open folder; `details` carry
--     sizes, the hashes before and after, the origin and destination of a move or a copy, the count
--     of a recursive delete, and `sensitive` for a file that changes what Claude may do. Never the
--     contents of a file.
--   * `file.failed` — the disk refused a write the trail had already recorded. It points at the
--     first fact, so the trail never asserts a write that did not happen.
--
-- Only the CHECK changes: no column, no index. `0013` is not edited — it has been applied, and a
-- migration once applied is history (docs/architecture/backend/05-persistence.md#migrations).
--
-- Reversal plan:
--   DELETE is refused by the trigger inside the retention floor, so rows of the new kinds cannot be
--   removed to make the old CHECK hold; reversing means keeping this CHECK. To drop it anyway on a
--   database with none of those rows:
--   ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_kind_known";
--   ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_kind_known"
--     CHECK ("kind" IN ('device.registered', 'device.approved', 'device.revoked', 'device.expired',
--       'permission.ruleGranted', 'permission.ruleRevoked', 'session.resumed', 'session.forked',
--       'session.filesRewound'));
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

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
    'session.filesRewound',
    'file.created',
    'file.written',
    'file.moved',
    'file.copied',
    'file.deleted',
    'file.failed'
  ));
