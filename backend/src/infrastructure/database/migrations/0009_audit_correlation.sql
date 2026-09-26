-- What a decision entry was, written with it: the correlation of plan 03, F2.
--
-- A decision entry (`allowed` / `denied`) said which tool, with which input, and who decided. It
-- did not say which request it settled, whether it was automatic, or which rule answered — that
-- lived only in `permission_requests`, which belongs to another module and is written twice. Reading
-- the trail would have meant joining it, and "who authorised this command?" would have depended on
-- a table that is rewritten ([D-15](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
--
-- So the entry carries it, in seven nullable columns:
--
--   * `trace_id`      the trace in scope when the entry was written — the turn's, for the hook and
--                     for a rule; the answer's, for a human decision (D-16). Every entry may have one.
--   * `request_id`    the permission request the decision settled.
--   * `auto`          the server decided, with nobody answering: a rule, or the deadline.
--   * `rule_id`       the rule that answered, when one did.
--   * `scope`         how far the answer reaches: once, session, project, always.
--   * `resolved_by`   who answered. Null on the refusal nobody made.
--   * `resolved_from` where the answer came from: web, mobile — null when nobody answered.
--
-- Adding them does not touch the append-only guarantee. `ADD COLUMN` with no default rewrites no row
-- and fires no row trigger; the entries written before this migration simply have no verdict, and the
-- screen says the link does not exist rather than inventing one. The reason `seq` had to be born in
-- `0003` — it needs a value on every row — does not apply to columns that are null on the old ones.
--
-- Two CHECKs say in the database what the domain already guarantees:
--
--   * a `recorded` entry carries no verdict. The hook fires before anybody has voted.
--   * only an automatic decision points at a rule. A rule is what answers when nobody does.
--
-- Reversal plan:
--   ALTER TABLE "audit_entries" DROP CONSTRAINT "audit_entries_rule_is_automatic";
--   ALTER TABLE "audit_entries" DROP CONSTRAINT "audit_entries_recorded_has_no_verdict";
--   ALTER TABLE "audit_entries" DROP COLUMN "resolved_from", DROP COLUMN "resolved_by",
--     DROP COLUMN "scope", DROP COLUMN "rule_id", DROP COLUMN "auto", DROP COLUMN "request_id",
--     DROP COLUMN "trace_id";
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

ALTER TABLE "audit_entries" ADD COLUMN IF NOT EXISTS "trace_id" text;
ALTER TABLE "audit_entries" ADD COLUMN IF NOT EXISTS "request_id" text;
ALTER TABLE "audit_entries" ADD COLUMN IF NOT EXISTS "auto" boolean;
ALTER TABLE "audit_entries" ADD COLUMN IF NOT EXISTS "rule_id" text;
ALTER TABLE "audit_entries" ADD COLUMN IF NOT EXISTS "scope" text;
ALTER TABLE "audit_entries" ADD COLUMN IF NOT EXISTS "resolved_by" text;
ALTER TABLE "audit_entries" ADD COLUMN IF NOT EXISTS "resolved_from" text;

ALTER TABLE "audit_entries" DROP CONSTRAINT IF EXISTS "audit_entries_recorded_has_no_verdict";
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_recorded_has_no_verdict"
  CHECK (
    "decision" <> 'recorded'
    OR (
      "request_id" IS NULL AND "auto" IS NULL AND "rule_id" IS NULL
      AND "scope" IS NULL AND "resolved_by" IS NULL AND "resolved_from" IS NULL
    )
  );

ALTER TABLE "audit_entries" DROP CONSTRAINT IF EXISTS "audit_entries_rule_is_automatic";
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_rule_is_automatic"
  CHECK ("rule_id" IS NULL OR "auto" IS TRUE);
