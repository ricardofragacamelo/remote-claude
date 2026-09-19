-- The audit trail: every tool invocation, for ever.
--
-- Two things here are not conventions, and the table would not do its job without either.
--
-- The id is a ULID in a `text` column, not a `uuid` with a database default: it is minted by the
-- domain's `IdGenerator`, like every other identity in this schema, and a default here would mean
-- the database decides who an entry is.
--
-- `seq` beside `id`. The paginated query of the trail needs a total, monotonic ordering, and `at`
-- is neither: two entries land in the same millisecond, and the clock of the user's machine can be
-- set backwards. `at` filters; `seq` orders. It is created now rather than added later because
-- adding a column to this table means altering the very table these triggers protect.
--
-- The triggers. Append-only is a property of the database, not a promise of the code:
--
--   * UPDATE aborts always. There is no legitimate edit to a record of what was executed.
--   * DELETE aborts inside the ninety-day floor, and is allowed outside it. That is what lets the
--     retention purge exist at all without the floor depending on the purge behaving.
--
-- The trigger applies to whoever is connected — no restricted role, no second connection string.
-- It is a barrier, not a permission: an owner can disable it. It stops the accident and the bug,
-- which is what it is for.
--
-- Reversal plan:
--   DROP TRIGGER "audit_entries_no_update" ON "audit_entries";
--   DROP TRIGGER "audit_entries_retention_floor" ON "audit_entries";
--   DROP FUNCTION "audit_entries_refuse_update";
--   DROP FUNCTION "audit_entries_refuse_recent_delete";
--   DROP TABLE "audit_entries";
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

CREATE TABLE IF NOT EXISTS "audit_entries" (
  "id" text PRIMARY KEY NOT NULL,
  "seq" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "user_id" text NOT NULL,
  "session_id" text NOT NULL,
  "tool_use_id" text,
  "tool_name" text NOT NULL,
  "input" jsonb NOT NULL,
  "decision" text NOT NULL,
  "device_id" text,
  "ip" text,
  "at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "audit_entries_decision_known"
    CHECK ("decision" IN ('recorded', 'allowed', 'denied'))
);

CREATE INDEX IF NOT EXISTS "audit_entries_user_id_seq_idx"
  ON "audit_entries" ("user_id", "seq" DESC);

CREATE INDEX IF NOT EXISTS "audit_entries_session_id_seq_idx"
  ON "audit_entries" ("session_id", "seq" DESC);

-- One record per invocation, however many times it is delivered.
--
-- The SDK redelivers a pending tool call after a transport gap, and a second row for the same
-- invocation would make the trail claim the command ran twice.
--
-- NULLS DISTINCT is the default and it is load-bearing here, not incidental: `tool_use_id` is
-- nullable because the SDK does not always give one, and under this rule two rows with no id do
-- not collide. Rows without an id are still kept — a gap in the trail is worse than a duplicate —
-- and the ones with an id are unique. Writing the index as a partial one would say the same thing
-- and would stop `ON CONFLICT` from inferring it.
CREATE UNIQUE INDEX IF NOT EXISTS "audit_entries_session_id_tool_use_id_key"
  ON "audit_entries" ("session_id", "tool_use_id") NULLS DISTINCT;

CREATE OR REPLACE FUNCTION "audit_entries_refuse_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_entries is append-only: UPDATE is refused'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "audit_entries_refuse_recent_delete"() RETURNS trigger AS $$
BEGIN
  -- The floor lives here and is immutable at run time. The effective retention window is
  -- configuration and may only ever be longer; a floor that a variable can lower is not a floor.
  IF OLD."at" > now() - interval '90 days' THEN
    RAISE EXCEPTION 'audit_entries is retained for 90 days: DELETE is refused'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "audit_entries_no_update" ON "audit_entries";
CREATE TRIGGER "audit_entries_no_update"
  BEFORE UPDATE ON "audit_entries"
  FOR EACH ROW EXECUTE FUNCTION "audit_entries_refuse_update"();

DROP TRIGGER IF EXISTS "audit_entries_retention_floor" ON "audit_entries";
CREATE TRIGGER "audit_entries_retention_floor"
  BEFORE DELETE ON "audit_entries"
  FOR EACH ROW EXECUTE FUNCTION "audit_entries_refuse_recent_delete"();
