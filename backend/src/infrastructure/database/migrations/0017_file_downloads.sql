-- Downloading a file or a folder, in the trail (plan 07, B-47).
--
-- Reading is not in the trail: the volume would be every click on the tree, and what a person reads
-- on their own machine is not the risk the trail exists for. Downloading is a read too, but it takes
-- contents **off the machine** — a file to another device, a folder as a zip — and "what left, and
-- when?" is exactly what the trail is for (07 · D-02).
--
-- One kind, one fact per item downloaded, recorded **before the first byte** leaves: a trail that
-- cannot take it is a download that does not happen (`503`, nothing sent). The subject is the real
-- path, the label the path relative to the open folder; `details` carry the bytes, the hash, the
-- range asked for, and for a zip the entries under the item. Never the contents of a file. The
-- preview and the pages of the hexadecimal view are reads, and stay out of it, in the log.
--
-- Only the CHECK changes: no column, no index. `0016` is not edited — it has been applied, and a
-- migration once applied is history (docs/architecture/backend/05-persistence.md#migrations).
--
-- Reversal plan:
--   DELETE is refused by the trigger inside the retention floor, so rows of the new kind cannot be
--   removed to make the old CHECK hold; reversing means keeping this CHECK. To drop it anyway on a
--   database with none of those rows, put back the CHECK of `0016`:
--   ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_kind_known";
--   ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_kind_known"
--     CHECK ("kind" IN ('device.registered', 'device.approved', 'device.revoked', 'device.expired',
--       'permission.ruleGranted', 'permission.ruleRevoked', 'session.resumed', 'session.forked',
--       'session.filesRewound', 'file.created', 'file.written', 'file.moved', 'file.copied',
--       'file.deleted', 'file.failed'));
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
    'file.failed',
    'file.downloaded'
  ));
