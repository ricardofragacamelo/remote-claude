-- The rules that outlive a session, and the two places that have to be able to point at one.
--
-- `permission_rules`
--
-- An authorisation given in advance to run a command on somebody's machine. Only the scopes that
-- have to survive the process are here — `project` and `always`. A `session` rule lives in memory
-- and dies with the subprocess, which is what a session rule means.
--
-- "user_id" and "expires_at" are NOT NULL, and both are the plan's decisions rather than habits.
-- A rule belongs to a person, never to the machine, and the owner is part of every match (D-03).
-- Every rule expires: a grant with no end outlives the reason it was made (D-02). The ceiling on
-- how far out "expires_at" may be is configuration, enforced when a rule is created — a CHECK here
-- would freeze the number into a migration.
--
-- "pattern" is the grammar of the Claude Code settings, exactly as written: `Bash`, `Bash(git
-- status)`, `Bash(git status:*)`. It is validated by the domain before it gets here (D-01).
--
-- A rule is never deleted. Revoking writes "revoked_at", and the row stays: the history of
-- requests points at the rule that answered, and "which rule let this run?" has to have an answer
-- after somebody took it back. An expired rule stays too, and is listed as expired.
--
-- There is no unique index. "The same rule twice is one rule" holds among the **active** ones,
-- and whether a rule is active depends on the clock — which an index cannot read. The repository
-- serialises grants of the same rule behind a transaction-scoped advisory lock instead.
--
-- `permission_requests.rule_id`
--
-- Which rule answered a request, when one did. Nullable, and without a foreign key: a request is
-- also answered by a person, by the deadline, or by the session ending, and a `session` rule is
-- never written here at all.
--
-- `audit_events_kind_known`
--
-- Granting and revoking a rule are security facts of the same weight as approving a device, and go
-- to the same trail. Only the CHECK changes; the triggers that refuse UPDATE and the DELETE inside
-- the retention floor are not touched.
--
-- Reversal plan:
--   ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_kind_known";
--   ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_kind_known"
--     CHECK ("kind" IN ('device.registered', 'device.approved', 'device.revoked', 'device.expired'));
--   ALTER TABLE "permission_requests" DROP COLUMN "rule_id";
--   DROP TABLE "permission_rules";
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

CREATE TABLE IF NOT EXISTS "permission_rules" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "scope" text NOT NULL,
  "project_path" text,
  "pattern" text NOT NULL,
  "decision" text NOT NULL,
  "granted_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "permission_rules_scope_known"
    CHECK ("scope" IN ('project', 'always')),
  CONSTRAINT "permission_rules_decision_known"
    CHECK ("decision" IN ('allow', 'deny')),
  -- The scope says where, and the row cannot say otherwise: a `project` rule names its project, and
  -- an `always` rule names none. A rule that disagreed with its own scope would be read generously
  -- by whoever wrote the query.
  CONSTRAINT "permission_rules_project_matches_scope"
    CHECK (("scope" = 'project') = ("project_path" IS NOT NULL)),
  CONSTRAINT "permission_rules_expires_after_grant"
    CHECK ("expires_at" > "granted_at")
);

CREATE INDEX IF NOT EXISTS "permission_rules_user_id_granted_at_idx"
  ON "permission_rules" ("user_id", "granted_at" DESC)
  WHERE "revoked_at" IS NULL;

ALTER TABLE "permission_requests" ADD COLUMN IF NOT EXISTS "rule_id" text;

ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "audit_events_kind_known";
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_kind_known"
  CHECK ("kind" IN (
    'device.registered',
    'device.approved',
    'device.revoked',
    'device.expired',
    'permission.ruleGranted',
    'permission.ruleRevoked'
  ));
