-- The configuration of Claude (plan 13): defaults, MCP servers and their secrets, approvals of a
-- repository's `.mcp.json`, plugins and the preferences of skills — and the `claude.*` kinds of the
-- trail. See docs/architecture/backend/05-persistence.md#a-configuração-do-claude.
--
-- Every table is **per user**: the CLI of the machine has one login, and what one person set never
-- reaches another's session.
--
--   * `claude_defaults` — a row with `folder_path` NULL is the user's default; a row with a folder is
--     the override of that folder and its subfolders (13 · D-04). A NULL field is "not set here".
--     `permission_mode` never takes `bypassPermissions`: the CHECK says what the domain says;
--   * `mcp_servers` — the store of servers (13 · D-01): transport, command and args, or URL; `scope`
--     `user`, or `folder` with the folder it applies under. The values of env and headers are **not**
--     here: they are secrets, write-only, in `mcp_server_secrets`;
--   * `mcp_server_secrets` — one row per variable or header, AES-256-GCM with a key read from a file
--     (13 · D-02): the ciphertext, its IV and its tag, never the value in clear;
--   * `mcp_project_approvals` — our approval of one entry of a folder's `.mcp.json`, by the digest of
--     the normalised entry (13 · D-11); a changed entry has another digest and is pending again;
--   * `claude_plugins` — a local directory, or a plugin a declared marketplace gave, downloaded by the
--     backend and pinned on its commit (13 · D-15); `approved_digest` is what was shown and approved,
--     and a plugin whose files no longer have it is pending again;
--   * `claude_skill_preferences` — which sources of skills are on, and which skills are off, for the
--     user or for a folder (13 · B-34).
--
-- Unique keys use `NULLS NOT DISTINCT` (PostgreSQL 15+): the user's own row has `folder_path` NULL,
-- and two of them would be two defaults.
--
-- Reversal plan:
--   DROP TABLE "claude_skill_preferences", "claude_plugins", "mcp_project_approvals",
--     "mcp_server_secrets", "mcp_servers", "claude_defaults";
--   The directories of downloaded plugins under RC_CLAUDE_PLUGINS_DIR go with them.
--   The CHECK: rows of a `claude.*` kind cannot be removed inside the retention floor (the trigger
--   refuses), so reversing means keeping it. On a database with none of them:
--   ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_kind_known";
--   ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_kind_known" CHECK ("kind" IN (
--       'device.registered',
--       'device.approved',
--       'device.revoked',
--       'device.expired',
--       'permission.ruleGranted',
--       'permission.ruleRevoked',
--       'session.resumed',
--       'session.forked',
--       'session.filesRewound',
--       'file.created',
--       'file.written',
--       'file.moved',
--       'file.copied',
--       'file.deleted',
--       'file.failed',
--       'file.downloaded',
--       'file.restored'));
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

CREATE TABLE IF NOT EXISTS "claude_defaults" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL,
  "folder_path" text,
  "model" text,
  "permission_mode" text,
  "effort" text,
  "thinking" text,
  "output_style" text,
  "fallback_model" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "claude_defaults_mode_known"
    CHECK ("permission_mode" IN ('default', 'acceptEdits', 'plan', 'allowAll')),
  CONSTRAINT "claude_defaults_effort_known"
    CHECK ("effort" IN ('low', 'medium', 'high', 'xhigh', 'max')),
  CONSTRAINT "claude_defaults_thinking_known" CHECK ("thinking" IN ('on', 'off')),
  CONSTRAINT "claude_defaults_fallback_differs" CHECK ("fallback_model" IS DISTINCT FROM "model" OR "model" IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS "claude_defaults_user_id_folder_path_key"
  ON "claude_defaults" ("user_id", "folder_path") NULLS NOT DISTINCT;

CREATE TABLE IF NOT EXISTS "mcp_servers" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "scope" text NOT NULL,
  "folder_path" text,
  "transport" text NOT NULL,
  "command" text,
  "args" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "url" text,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "mcp_servers_scope_known" CHECK ("scope" IN ('user', 'folder')),
  CONSTRAINT "mcp_servers_folder_matches_scope" CHECK (("scope" = 'folder') = ("folder_path" IS NOT NULL)),
  CONSTRAINT "mcp_servers_transport_known" CHECK ("transport" IN ('stdio', 'http', 'sse')),
  CONSTRAINT "mcp_servers_transport_fields" CHECK (
    ("transport" = 'stdio' AND "command" IS NOT NULL AND "url" IS NULL)
    OR ("transport" IN ('http', 'sse') AND "url" IS NOT NULL AND "command" IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_servers_user_id_scope_folder_name_key"
  ON "mcp_servers" ("user_id", "scope", "folder_path", "name") NULLS NOT DISTINCT;

CREATE TABLE IF NOT EXISTS "mcp_server_secrets" (
  "server_id" text NOT NULL REFERENCES "mcp_servers" ("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "name" text NOT NULL,
  "ciphertext" bytea,
  "iv" bytea,
  "tag" bytea,
  "position" integer NOT NULL,
  PRIMARY KEY ("server_id", "kind", "name"),
  CONSTRAINT "mcp_server_secrets_kind_known" CHECK ("kind" IN ('env', 'header'))
);

CREATE TABLE IF NOT EXISTS "mcp_project_approvals" (
  "user_id" text NOT NULL,
  "folder_path" text NOT NULL,
  "name" text NOT NULL,
  "digest" text NOT NULL,
  "decision" text NOT NULL,
  "decided_at" timestamptz NOT NULL,
  PRIMARY KEY ("user_id", "folder_path", "name"),
  CONSTRAINT "mcp_project_approvals_decision_known" CHECK ("decision" IN ('approved', 'rejected'))
);

CREATE TABLE IF NOT EXISTS "claude_plugins" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL,
  "origin" text NOT NULL,
  "path" text NOT NULL,
  "name" text NOT NULL,
  "marketplace" text,
  "commit" text,
  "approved_digest" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "claude_plugins_origin_known" CHECK ("origin" IN ('local', 'marketplace')),
  CONSTRAINT "claude_plugins_marketplace_matches_origin"
    CHECK (("origin" = 'marketplace') = ("marketplace" IS NOT NULL AND "commit" IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS "claude_plugins_user_id_path_key" ON "claude_plugins" ("user_id", "path");

CREATE TABLE IF NOT EXISTS "claude_skill_preferences" (
  "user_id" text NOT NULL,
  "folder_path" text,
  "sources" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "disabled_skills" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "claude_skill_preferences_user_id_folder_path_key"
  ON "claude_skill_preferences" ("user_id", "folder_path") NULLS NOT DISTINCT;

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
    'file.downloaded',
    'file.restored',
    'claude.defaultsChanged',
    'claude.mcpServerAdded',
    'claude.mcpServerChanged',
    'claude.mcpServerRemoved',
    'claude.mcpServerToggled',
    'claude.mcpServerTested',
    'claude.mcpProjectServerApproved',
    'claude.mcpProjectServerRejected',
    'claude.pluginAdded',
    'claude.pluginUpdated',
    'claude.pluginToggled',
    'claude.pluginRemoved',
    'claude.skillSourceToggled'
  ));
