-- The rules speak the canonical grammar, and the records of a call keep its kind (plan 28, B-33, D-18).
--
-- `permission_rules`
--
-- "engine" — the engine a rule is restricted to, or NULL for a canonical rule, which holds for every
-- engine whose calls have the kind. No default and no back-fill: every rule written before this was a
-- rule of the only engine there was, and its canonical translation holds for every engine.
--
-- "grammar" — `native` for a rule still written in an engine's grammar (`Bash(git status:*)`), and
-- `canonical` once it is not. Every row present when this runs gets `native`: the data step that
-- runs at boot after the migrations (`MigrateRulesUseCase`) translates each one through the engine's
-- dialect and marks it `canonical` — converted, or switched off. The default is dropped right after
-- the column is filled, so a new row has to say which grammar it is in: the repository writes
-- `canonical`, always.
--
-- "disabled_reason" — why a rule was switched off: a rule of an engine's grammar with no unambiguous
-- canonical translation. It keeps its pattern as written, and never answers; it is never deleted,
-- and the rules screen lists it for the person to write again.
--
-- "native_pattern" — the pattern as the engine's grammar wrote it, kept beside a converted rule, and
-- on a disabled one (where it is also the pattern).
--
-- `audit_entries.tool_kind`, `permission_requests.tool_kind`
--
-- The canonical kind of the call (`shell`, `file.edit`…), beside "tool_name", which stays the
-- engine's own name. Written for every new row from the call as the engine's adapter read it; the
-- rows written before are filled by the same data step, through the engine's classifier — a name it
-- does not know is `other`. The trail is filtered by it, so it has the index its query needs.
--
-- `audit_entries_refuse_update`
--
-- The trail aborts every UPDATE, and still does — with one exception, for that fill: an UPDATE whose
-- only change is "tool_kind" going from NULL to a value. Every other column, and a kind that was
-- already there, are as untouchable as before.
--
-- Idempotent: every column, constraint and index is added only if missing, and the function is
-- replaced by the same text — run twice, it changes nothing the second time (S-98, S-134).
--
-- Reversal plan:
--   DROP INDEX IF EXISTS "audit_entries_user_id_tool_kind_seq_idx";
--   CREATE OR REPLACE FUNCTION "audit_entries_refuse_update"() RETURNS trigger AS $$
--   BEGIN
--     RAISE EXCEPTION 'audit_entries is append-only: UPDATE is refused'
--       USING ERRCODE = 'restrict_violation';
--   END;
--   $$ LANGUAGE plpgsql;
--   ALTER TABLE "audit_entries" DROP COLUMN IF EXISTS "tool_kind";
--   ALTER TABLE "permission_requests" DROP COLUMN IF EXISTS "tool_kind";
--   UPDATE "permission_rules" SET "pattern" = "native_pattern" WHERE "native_pattern" IS NOT NULL;
--   ALTER TABLE "permission_rules" DROP CONSTRAINT IF EXISTS "permission_rules_grammar_known";
--   ALTER TABLE "permission_rules" DROP CONSTRAINT IF EXISTS "permission_rules_disabled_is_canonical";
--   ALTER TABLE "permission_rules" DROP CONSTRAINT IF EXISTS "permission_rules_engine_form";
--   ALTER TABLE "permission_rules" DROP COLUMN IF EXISTS "native_pattern";
--   ALTER TABLE "permission_rules" DROP COLUMN IF EXISTS "disabled_reason";
--   ALTER TABLE "permission_rules" DROP COLUMN IF EXISTS "grammar";
--   ALTER TABLE "permission_rules" DROP COLUMN IF EXISTS "engine";
--   (a rule granted after this migration is in the canonical grammar, which the code before it does
--   not read: revoke those first.)
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

ALTER TABLE "permission_rules" ADD COLUMN IF NOT EXISTS "engine" text;
ALTER TABLE "permission_rules" ADD COLUMN IF NOT EXISTS "grammar" text NOT NULL DEFAULT 'native';
ALTER TABLE "permission_rules" ALTER COLUMN "grammar" DROP DEFAULT;
ALTER TABLE "permission_rules" ADD COLUMN IF NOT EXISTS "disabled_reason" text;
ALTER TABLE "permission_rules" ADD COLUMN IF NOT EXISTS "native_pattern" text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'permission_rules_grammar_known') THEN
    ALTER TABLE "permission_rules" ADD CONSTRAINT "permission_rules_grammar_known"
      CHECK ("grammar" IN ('native', 'canonical'));
  END IF;

  -- Switching a rule off is what the migration does to a rule it read: it is processed.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'permission_rules_disabled_is_canonical'
  ) THEN
    ALTER TABLE "permission_rules" ADD CONSTRAINT "permission_rules_disabled_is_canonical"
      CHECK ("disabled_reason" IS NULL OR "grammar" = 'canonical');
  END IF;

  -- The form of an engine's name, as the domain reads it (`EngineId`).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'permission_rules_engine_form') THEN
    ALTER TABLE "permission_rules" ADD CONSTRAINT "permission_rules_engine_form"
      CHECK ("engine" IS NULL OR "engine" ~ '^[a-z][a-z0-9-]{0,31}$');
  END IF;
END $$;

ALTER TABLE "audit_entries" ADD COLUMN IF NOT EXISTS "tool_kind" text;
ALTER TABLE "permission_requests" ADD COLUMN IF NOT EXISTS "tool_kind" text;

-- The trail filtered by kind walks the owner's entries of that kind, newest first.
CREATE INDEX IF NOT EXISTS "audit_entries_user_id_tool_kind_seq_idx"
  ON "audit_entries" ("user_id", "tool_kind", "seq" DESC);

CREATE OR REPLACE FUNCTION "audit_entries_refuse_update"() RETURNS trigger AS $$
BEGIN
  -- The one change the trail accepts: the kind of a call written before the kind was kept, given
  -- once. Compared as whole rows without that column, so nothing else can ride along.
  IF OLD."tool_kind" IS NULL
     AND NEW."tool_kind" IS NOT NULL
     AND (to_jsonb(NEW) - 'tool_kind') = (to_jsonb(OLD) - 'tool_kind') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'audit_entries is append-only: UPDATE is refused'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
