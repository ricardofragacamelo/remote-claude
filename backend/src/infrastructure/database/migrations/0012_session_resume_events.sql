-- Continuing a conversation is a fact of the trail: `audit_events_kind_known`.
--
-- Resuming a conversation hands a phone the context of everything said before, and a fork of one
-- begun in the editor starts a second life of it under a new id. "Who picked this up again, from
-- where, and when" has to be answerable from the trail, like approving a device or granting a rule.
--
-- Two kinds rather than one with a flag, because they are two different acts: `session.resumed`
-- continues one of our own conversations in its file, and `session.forked` copies one begun
-- elsewhere into a new one, never writing into the original.
--
-- Only the CHECK changes; the triggers that refuse UPDATE and the DELETE inside the retention floor
-- are not touched. Nothing of the conversation itself lands here — the subject is its id and the
-- label is the workspace, never a message (S-28).
--
-- Reversal plan:
--   ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_kind_known";
--   ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_kind_known"
--     CHECK ("kind" IN ('device.registered', 'device.approved', 'device.revoked', 'device.expired',
--       'permission.ruleGranted', 'permission.ruleRevoked'));
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
    'session.forked'
  ));
