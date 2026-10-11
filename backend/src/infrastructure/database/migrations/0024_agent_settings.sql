-- The configuration of plan 13 split between the core and the Claude extension (plan 28, B-36, D-06).
--
-- `claude_defaults` → `agent_defaults`
--
-- The defaults of a session — model, mode, effort, thinking, fallback model — are the core's, by
-- engine. The table is renamed, keeps every row and gets "engine": every row written before this was
-- a default of the only engine there was, `claude`. The unique key is the owner, the engine and the
-- folder (`NULLS NOT DISTINCT`, as before: the user's own row has no folder). The constraints keep
-- their rules under the table's new name — the CHECK of the canonical modes among them (0022) — and
-- the engine has the form the domain reads (`EngineId`).
--
-- `claude_output_style_defaults`
--
-- The output style is a style of Claude's answers, so the extension's: its column leaves the core's
-- table for one of the extension's, with every value set — the user's (`folder_path` NULL) and each
-- folder's — copied over before the column is dropped.
--
-- `mcp_servers`, `mcp_project_approvals`
--
-- MCP is an open protocol, a capability of the core (`mcp`), kept by engine: both tables get
-- "engine", `claude` for every row present, and their keys include it. `mcp_server_secrets` belongs to
-- a server, and so to the server's engine.
--
-- `claude_plugins` and `claude_skill_preferences` are the extension's and keep their names (D-10).
--
-- Idempotent: the rename happens only from the old name to a free new one, every column, constraint
-- and index is added or renamed only if missing, and the output style is copied only while the
-- column is there — run twice, it changes nothing the second time.
--
-- Reversal plan:
--   ALTER TABLE "agent_defaults" ADD COLUMN IF NOT EXISTS "output_style" text;
--   UPDATE "agent_defaults" d SET "output_style" = s."output_style"
--     FROM "claude_output_style_defaults" s
--     WHERE d."engine" = 'claude' AND d."user_id" = s."user_id"
--       AND d."folder_path" IS NOT DISTINCT FROM s."folder_path";
--   (a style set where no default row exists needs a row: INSERT one with the style's id first.)
--   DROP TABLE "claude_output_style_defaults";
--   DELETE FROM "agent_defaults" WHERE "engine" <> 'claude';
--   DROP INDEX IF EXISTS "agent_defaults_user_id_engine_folder_path_key";
--   CREATE UNIQUE INDEX "claude_defaults_user_id_folder_path_key"
--     ON "agent_defaults" ("user_id", "folder_path") NULLS NOT DISTINCT;
--   ALTER TABLE "agent_defaults" DROP CONSTRAINT IF EXISTS "agent_defaults_engine_form";
--   ALTER TABLE "agent_defaults" DROP COLUMN "engine";
--   ALTER TABLE "agent_defaults" RENAME CONSTRAINT "agent_defaults_pkey" TO "claude_defaults_pkey";
--   (and so on for `_mode_canonical`, `_effort_known`, `_thinking_known`, `_fallback_differs`)
--   ALTER TABLE "agent_defaults" RENAME TO "claude_defaults";
--   DELETE FROM "mcp_servers" WHERE "engine" <> 'claude';
--   DROP INDEX IF EXISTS "mcp_servers_user_id_engine_scope_folder_name_key";
--   CREATE UNIQUE INDEX "mcp_servers_user_id_scope_folder_name_key"
--     ON "mcp_servers" ("user_id", "scope", "folder_path", "name") NULLS NOT DISTINCT;
--   ALTER TABLE "mcp_servers" DROP CONSTRAINT IF EXISTS "mcp_servers_engine_form";
--   ALTER TABLE "mcp_servers" DROP COLUMN "engine";
--   DELETE FROM "mcp_project_approvals" WHERE "engine" <> 'claude';
--   ALTER TABLE "mcp_project_approvals"
--     DROP CONSTRAINT "mcp_project_approvals_user_engine_folder_name_pkey";
--   ALTER TABLE "mcp_project_approvals" ADD PRIMARY KEY ("user_id", "folder_path", "name");
--   ALTER TABLE "mcp_project_approvals" DROP CONSTRAINT IF EXISTS "mcp_project_approvals_engine_form";
--   ALTER TABLE "mcp_project_approvals" DROP COLUMN "engine";
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

DO $$
BEGIN
  IF to_regclass('claude_defaults') IS NOT NULL
     AND to_regclass('agent_defaults') IS NULL THEN
    ALTER TABLE "claude_defaults" RENAME TO "agent_defaults";
  END IF;
END $$;

ALTER TABLE "agent_defaults" ADD COLUMN IF NOT EXISTS "engine" text NOT NULL DEFAULT 'claude';
ALTER TABLE "agent_defaults" ALTER COLUMN "engine" DROP DEFAULT;

-- The constraints, under the table's name: each renamed only while the old name is there.
DO $$
DECLARE
  suffix text;
BEGIN
  FOREACH suffix IN ARRAY ARRAY['pkey', 'mode_canonical', 'effort_known', 'thinking_known', 'fallback_differs']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claude_defaults_' || suffix)
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_defaults_' || suffix) THEN
      EXECUTE format(
        'ALTER TABLE "agent_defaults" RENAME CONSTRAINT %I TO %I',
        'claude_defaults_' || suffix,
        'agent_defaults_' || suffix
      );
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_defaults_engine_form') THEN
    ALTER TABLE "agent_defaults" ADD CONSTRAINT "agent_defaults_engine_form"
      CHECK ("engine" ~ '^[a-z][a-z0-9-]{0,31}$');
  END IF;
END $$;

DROP INDEX IF EXISTS "claude_defaults_user_id_folder_path_key";
CREATE UNIQUE INDEX IF NOT EXISTS "agent_defaults_user_id_engine_folder_path_key"
  ON "agent_defaults" ("user_id", "engine", "folder_path") NULLS NOT DISTINCT;

CREATE TABLE IF NOT EXISTS "claude_output_style_defaults" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL,
  "folder_path" text,
  "output_style" text NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "claude_output_style_defaults_user_id_folder_path_key"
  ON "claude_output_style_defaults" ("user_id", "folder_path") NULLS NOT DISTINCT;

-- Every output style set, copied with the id and the instant of its row — then the column goes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'agent_defaults' AND column_name = 'output_style'
  ) THEN
    INSERT INTO "claude_output_style_defaults" ("id", "user_id", "folder_path", "output_style", "updated_at")
      SELECT "id", "user_id", "folder_path", "output_style", "updated_at"
      FROM "agent_defaults"
      WHERE "output_style" IS NOT NULL AND "engine" = 'claude'
      ON CONFLICT DO NOTHING;
    ALTER TABLE "agent_defaults" DROP COLUMN "output_style";
  END IF;
END $$;

ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "engine" text NOT NULL DEFAULT 'claude';
ALTER TABLE "mcp_servers" ALTER COLUMN "engine" DROP DEFAULT;
DROP INDEX IF EXISTS "mcp_servers_user_id_scope_folder_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_servers_user_id_engine_scope_folder_name_key"
  ON "mcp_servers" ("user_id", "engine", "scope", "folder_path", "name") NULLS NOT DISTINCT;

ALTER TABLE "mcp_project_approvals" ADD COLUMN IF NOT EXISTS "engine" text NOT NULL DEFAULT 'claude';
ALTER TABLE "mcp_project_approvals" ALTER COLUMN "engine" DROP DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mcp_servers_engine_form') THEN
    ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_engine_form"
      CHECK ("engine" ~ '^[a-z][a-z0-9-]{0,31}$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mcp_project_approvals_engine_form') THEN
    ALTER TABLE "mcp_project_approvals" ADD CONSTRAINT "mcp_project_approvals_engine_form"
      CHECK ("engine" ~ '^[a-z][a-z0-9-]{0,31}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mcp_project_approvals_user_engine_folder_name_pkey'
  ) THEN
    ALTER TABLE "mcp_project_approvals" DROP CONSTRAINT IF EXISTS "mcp_project_approvals_pkey";
    ALTER TABLE "mcp_project_approvals" ADD CONSTRAINT "mcp_project_approvals_user_engine_folder_name_pkey"
      PRIMARY KEY ("user_id", "engine", "folder_path", "name");
  END IF;
END $$;
