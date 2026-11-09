-- The rules management screen (plan 15, F0, B-05, B-07): origin on a rule, an expiry-reminder
-- marker, three trail kinds, and the index a rule's usage and invocation history read.
--
-- `permission_rules`
--
-- Five nullable columns, none of them touching an existing invariant:
--
--   granted_via               — how the rule came to exist: 'approval' | 'request' | 'import' |
--                                'restore', or NULL for a rule granted before this column existed
--                                (B-09 of plan 15 is what starts writing it; a NULL here reads
--                                "origin not recorded", never a guess).
--   granted_from_request_id   — the permission request a card's 'approval' answered.
--   template_id               — the catalog template a rule came from, when it did.
--   restored_from             — the revoked rule a 'restore' undoes (D-11 of plan 15).
--   expiry_reminded_at        — when the expiry-reminder job last told the owner about this rule
--                                (D-18 of plan 15); extending the rule clears it, same as a fresh
--                                grant never sets it.
--
-- `audit_entries`
--
-- A new partial index, `(user_id, rule_id, seq DESC) WHERE rule_id IS NOT NULL`: a rule's usage
-- count and its invocation history (D-05 of plan 15) both walk exactly this slice, and most entries
-- have no `rule_id` at all. `CREATE INDEX` does not rewrite a row or fire the trail's own `UPDATE`
-- trigger, so this is safe on a table that already has data.
--
-- `audit_events_kind_known`
--
-- Three kinds added, none renamed: 'permission.ruleExpiryChanged' (a rule's validity shortened or
-- extended), 'permission.rulesExported' and 'permission.rulesImported' (B-05 of plan 15). Granting
-- and revoking already have their kinds; a restored rule is a fresh 'permission.ruleGranted' with
-- `restoredFrom` in `details`, not a kind of its own.
--
-- Reversal plan:
--   ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_kind_known";
--   ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_kind_known" CHECK ("kind" IN (
--     … the list of 0025, without the three kinds this migration adds … ));
--   DROP INDEX IF EXISTS "audit_entries_user_id_rule_id_seq_idx";
--   ALTER TABLE "permission_rules"
--     DROP COLUMN "granted_via",
--     DROP COLUMN "granted_from_request_id",
--     DROP COLUMN "template_id",
--     DROP COLUMN "restored_from",
--     DROP COLUMN "expiry_reminded_at";
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

ALTER TABLE "permission_rules"
  ADD COLUMN IF NOT EXISTS "granted_via" text,
  ADD COLUMN IF NOT EXISTS "granted_from_request_id" text,
  ADD COLUMN IF NOT EXISTS "template_id" text,
  ADD COLUMN IF NOT EXISTS "restored_from" text,
  ADD COLUMN IF NOT EXISTS "expiry_reminded_at" timestamptz;

ALTER TABLE "permission_rules" DROP CONSTRAINT IF EXISTS "permission_rules_granted_via_known";
ALTER TABLE "permission_rules" ADD CONSTRAINT "permission_rules_granted_via_known"
  CHECK ("granted_via" IS NULL OR "granted_via" IN ('approval', 'request', 'import', 'restore'));

CREATE INDEX IF NOT EXISTS "audit_entries_user_id_rule_id_seq_idx"
  ON "audit_entries" ("user_id", "rule_id", "seq" DESC)
  WHERE "rule_id" IS NOT NULL;

ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "audit_events_kind_known";

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_kind_known"
  CHECK ("kind" IN (
    'device.registered',
    'device.approved',
    'device.revoked',
    'device.expired',
    'permission.ruleGranted',
    'permission.ruleRevoked',
    'permission.ruleExpiryChanged',
    'permission.rulesExported',
    'permission.rulesImported',
    'session.resumed',
    'session.forked',
    'session.filesRewound',
    'file.created',
    'file.written',
    'file.moved',
    'file.copied',
    'file.deleted',
    'file.failed',
    'file.downloaded',
    'file.restored',
    'agentSettings.defaultsChanged',
    'mcp.serverAdded',
    'mcp.serverChanged',
    'mcp.serverRemoved',
    'mcp.serverToggled',
    'mcp.serverTested',
    'mcp.projectServerApproved',
    'mcp.projectServerRejected',
    'engine.pluginAdded',
    'engine.pluginUpdated',
    'engine.pluginToggled',
    'engine.pluginRemoved',
    'engine.skillSourceToggled',
    'engine.diagnosticsProbed'
  ));
