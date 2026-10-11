-- No kind of the trail names an engine (plan 28, B-36, D-10).
--
-- The kinds plan 13 wrote under `claude.*` are renamed by the module that now owns each fact:
--
--   claude.defaultsChanged           → agentSettings.defaultsChanged    (core, by engine)
--   claude.mcpServerAdded            → mcp.serverAdded                  (core, by engine)
--   claude.mcpServerChanged          → mcp.serverChanged
--   claude.mcpServerRemoved          → mcp.serverRemoved
--   claude.mcpServerToggled          → mcp.serverToggled
--   claude.mcpServerTested           → mcp.serverTested
--   claude.mcpProjectServerApproved  → mcp.projectServerApproved
--   claude.mcpProjectServerRejected  → mcp.projectServerRejected
--   claude.pluginAdded               → engine.pluginAdded               (an engine's extension)
--   claude.pluginUpdated             → engine.pluginUpdated
--   claude.pluginToggled             → engine.pluginToggled
--   claude.pluginRemoved             → engine.pluginRemoved
--   claude.skillSourceToggled        → engine.skillSourceToggled
--   (new)                            → engine.diagnosticsProbed
--
-- Every renamed row says, in `details`, the engine it was of: `claude`, the only one there was.
--
-- `audit_events_refuse_update`
--
-- The trail aborts every UPDATE, and the rename is one. For the length of this migration — inside
-- its transaction — the trigger accepts exactly that UPDATE and nothing else: the kind going from a
-- `claude.*` name to its new name above, `details` gaining `"engine": "claude"` and every other column
-- unchanged, compared as whole rows. The refusal of every UPDATE is put back before the migration
-- ends.
--
-- Idempotent: the rename touches only the old names, the CHECK is replaced by the same text, and the
-- functions are replaced by the same text — run twice, it changes nothing the second time.
--
-- Reversal plan:
--   ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "audit_events_kind_known";
--   (rename the rows back with the inverse map, under the same temporary exception of the trigger,
--   and strip "engine" from their details)
--   ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_kind_known" CHECK ("kind" IN (
--     … the list of 0020, its `claude.*` kinds included … ));
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

CREATE OR REPLACE FUNCTION "audit_event_kind_renamed"(old_kind text) RETURNS text AS $$
  SELECT CASE old_kind
    WHEN 'claude.defaultsChanged' THEN 'agentSettings.defaultsChanged'
    WHEN 'claude.mcpServerAdded' THEN 'mcp.serverAdded'
    WHEN 'claude.mcpServerChanged' THEN 'mcp.serverChanged'
    WHEN 'claude.mcpServerRemoved' THEN 'mcp.serverRemoved'
    WHEN 'claude.mcpServerToggled' THEN 'mcp.serverToggled'
    WHEN 'claude.mcpServerTested' THEN 'mcp.serverTested'
    WHEN 'claude.mcpProjectServerApproved' THEN 'mcp.projectServerApproved'
    WHEN 'claude.mcpProjectServerRejected' THEN 'mcp.projectServerRejected'
    WHEN 'claude.pluginAdded' THEN 'engine.pluginAdded'
    WHEN 'claude.pluginUpdated' THEN 'engine.pluginUpdated'
    WHEN 'claude.pluginToggled' THEN 'engine.pluginToggled'
    WHEN 'claude.pluginRemoved' THEN 'engine.pluginRemoved'
    WHEN 'claude.skillSourceToggled' THEN 'engine.skillSourceToggled'
  END
$$ LANGUAGE sql IMMUTABLE;

-- The one UPDATE the trail takes while this migration runs: the rename, and nothing riding along.
CREATE OR REPLACE FUNCTION "audit_events_refuse_update"() RETURNS trigger AS $$
BEGIN
  IF "audit_event_kind_renamed"(OLD."kind") IS NOT NULL
     AND NEW."kind" = "audit_event_kind_renamed"(OLD."kind")
     AND NEW."details" = COALESCE(OLD."details", '{}'::jsonb) || jsonb_build_object('engine', 'claude')
     AND (to_jsonb(NEW) - 'kind' - 'details') = (to_jsonb(OLD) - 'kind' - 'details') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'audit_events is append-only: UPDATE is refused'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "audit_events_kind_known";

UPDATE "audit_events"
  SET "kind" = "audit_event_kind_renamed"("kind"),
      "details" = COALESCE("details", '{}'::jsonb) || jsonb_build_object('engine', 'claude')
  WHERE "audit_event_kind_renamed"("kind") IS NOT NULL;

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

-- The trail refuses every UPDATE again, as 0007 wrote it.
CREATE OR REPLACE FUNCTION "audit_events_refuse_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: UPDATE is refused'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS "audit_event_kind_renamed"(text);
