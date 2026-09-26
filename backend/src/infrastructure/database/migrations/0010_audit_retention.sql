-- The retention purge of plan 03, F3: its record, its indexes, and a floor measured in hours.
--
-- `audit_purges`
--
-- The purge is the one operation that removes trail, and an operation that removes trail without
-- leaving any is the obvious hole of the whole design. So it leaves some: one row per batch, with
-- the run it belongs to, who started it (`job` or `cli`), which trail, the window and how many rows
-- went ([D-19](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
--
-- The row is written **by the statement that deletes the batch** — a data-modifying CTE whose
-- INSERT counts what its DELETE returned. One statement is one transaction: either the batch goes
-- and the record comes in, or neither does. There is no instant at which rows are gone and nothing
-- says who took them. A batch that deletes nothing writes nothing (`deleted > 0`).
--
-- It is not `audit_events`: every row there is somebody's, with a subject, and a purge sweeps
-- everybody's trail at once. Filling those NOT NULLs with a made-up "system" user would turn them
-- into maybes on the table whose point is that it can be trusted.
--
-- Its triggers refuse UPDATE **and** DELETE, always. The record of what the purge removed is not
-- itself purgeable — and the purge never touches it.
--
-- `retention_days >= 90` repeats the floor once more, in the one place a purge configured below it
-- would have to write before deleting anything.
--
-- The `at` indexes
--
-- A batch is "the oldest rows before the cutoff", which without an index on `at` is a scan of the
-- trail per batch — a purge that gets slower as the trail it is meant to keep short gets longer.
--
-- The floor, in hours
--
-- `0003` and `0007` compared `OLD.at > now() - interval '90 days'`. For a `timestamptz`, adding
-- days is calendar arithmetic **in the session's time zone**: across a daylight-saving change,
-- ninety days are 2159 or 2161 hours, and the code counts 90 × 24. With the window at the floor —
-- the default — a purge would try to delete an hour that the database calls recent, and every batch
-- in it would fail, every day, for months a year, on any PostgreSQL that inherited the machine's
-- time zone ([D-21](../../../../../docs/plans/03-rules-and-audit/decisions.md)). `2160 hours` is
-- absolute arithmetic and the same everywhere. Only the functions are replaced; the triggers, and
-- the migrations that created them, are untouched.
--
-- Reversal plan:
--   (restore the two functions from 0003 and 0007 with `interval '90 days'`)
--   DROP INDEX "audit_events_at_idx";
--   DROP INDEX "audit_entries_at_idx";
--   DROP TRIGGER "audit_purges_no_delete" ON "audit_purges";
--   DROP TRIGGER "audit_purges_no_update" ON "audit_purges";
--   DROP FUNCTION "audit_purges_refuse_change";
--   DROP TABLE "audit_purges";
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

CREATE TABLE IF NOT EXISTS "audit_purges" (
  "id" text PRIMARY KEY NOT NULL,
  "seq" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "purge_id" text NOT NULL,
  "triggered_by" text NOT NULL,
  "trail" text NOT NULL,
  "retention_days" integer NOT NULL,
  "cutoff" timestamptz NOT NULL,
  "deleted" integer NOT NULL,
  "at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "audit_purges_triggered_by_known"
    CHECK ("triggered_by" IN ('job', 'cli')),
  CONSTRAINT "audit_purges_trail_known"
    CHECK ("trail" IN ('entries', 'events')),
  CONSTRAINT "audit_purges_retention_at_least_floor"
    CHECK ("retention_days" >= 90),
  CONSTRAINT "audit_purges_deleted_something"
    CHECK ("deleted" > 0)
);

CREATE INDEX IF NOT EXISTS "audit_purges_purge_id_idx" ON "audit_purges" ("purge_id");

CREATE OR REPLACE FUNCTION "audit_purges_refuse_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_purges is append-only: % is refused', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "audit_purges_no_update" ON "audit_purges";
CREATE TRIGGER "audit_purges_no_update"
  BEFORE UPDATE ON "audit_purges"
  FOR EACH ROW EXECUTE FUNCTION "audit_purges_refuse_change"();

DROP TRIGGER IF EXISTS "audit_purges_no_delete" ON "audit_purges";
CREATE TRIGGER "audit_purges_no_delete"
  BEFORE DELETE ON "audit_purges"
  FOR EACH ROW EXECUTE FUNCTION "audit_purges_refuse_change"();

CREATE INDEX IF NOT EXISTS "audit_entries_at_idx" ON "audit_entries" ("at");
CREATE INDEX IF NOT EXISTS "audit_events_at_idx" ON "audit_events" ("at");

CREATE OR REPLACE FUNCTION "audit_entries_refuse_recent_delete"() RETURNS trigger AS $$
BEGIN
  -- The floor lives here and is immutable at run time. The effective retention window is
  -- configuration and may only ever be longer; a floor that a variable can lower is not a floor.
  -- Hours, not days: the same span in every time zone, and the same span the code counts.
  IF OLD."at" > now() - interval '2160 hours' THEN
    RAISE EXCEPTION 'audit_entries is retained for 90 days: DELETE is refused'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "audit_events_refuse_recent_delete"() RETURNS trigger AS $$
BEGIN
  -- Same floor as the invocation trail, and measured the same way.
  IF OLD."at" > now() - interval '2160 hours' THEN
    RAISE EXCEPTION 'audit_events is retained for 90 days: DELETE is refused'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
