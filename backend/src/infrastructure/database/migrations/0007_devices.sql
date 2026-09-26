-- Which installations of the app may decide something, and the trail of how they got there.
--
-- Two tables, and both exist for the same sentence: the OIDC token proves *who*, the device
-- registration proves *where from*, and the decision they authorise runs a command on somebody's
-- machine.
--
-- `devices`
--
-- The unique key is the pair ("user_id", "install_id") and it is born composite. The identity
-- belongs to the installation; the approval belongs to the user. With "install_id" alone, user B
-- registering on the same phone would overwrite user A's already approved row, and the approval
-- would be inherited in silence — the exact opposite of what registration exists to guarantee.
-- Adding the column later would mean altering a table that already has data in it (D-10).
--
-- "install_id" is minted by the app on first run and kept in the operating system's secure
-- storage. It is deliberately not an identifier of the device: that one survives an uninstall,
-- which is a privacy problem, and this one does not (D-01).
--
-- "push_token" is nullable twice over: a device with no token still watches sessions, and a token
-- the provider refuses is erased while the device stays approved (D-13).
--
-- There is no expiry column. A registration nobody approved inside seven days is deleted rather
-- than given a fourth state (D-11) — a long list of pending devices is how the wrong one gets
-- approved out of fatigue, months later.
--
-- `audit_events`
--
-- Registering, approving and revoking a device are security facts of the same weight as
-- authorising a command, and they belong in the trail. They do not belong in "audit_entries":
-- that table is shaped around one invocation — a session, a tool name, an exact input — and none
-- of the three has an honest value here. Making them nullable would have turned every NOT NULL on
-- the table whose whole point is that it can be trusted into a maybe.
--
-- So it is a sibling table with the same discipline: a "seq" that orders while "at" filters, a
-- ULID minted by the domain rather than a database default, and triggers that refuse UPDATE always
-- and DELETE inside the ninety-day floor.
--
-- Reversal plan:
--   DROP TRIGGER "audit_events_no_update" ON "audit_events";
--   DROP TRIGGER "audit_events_retention_floor" ON "audit_events";
--   DROP FUNCTION "audit_events_refuse_update";
--   DROP FUNCTION "audit_events_refuse_recent_delete";
--   DROP TABLE "audit_events";
--   DROP TABLE "devices";
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

CREATE TABLE IF NOT EXISTS "devices" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "install_id" text NOT NULL,
  "name" text NOT NULL,
  "platform" text NOT NULL,
  "app_version" text NOT NULL,
  "push_token" text,
  "locale" text NOT NULL,
  "status" text NOT NULL,
  "registered_at" timestamptz NOT NULL,
  "last_seen_at" timestamptz NOT NULL,
  "approved_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "devices_status_known"
    CHECK ("status" IN ('pending', 'approved', 'revoked')),
  CONSTRAINT "devices_platform_known"
    CHECK ("platform" IN ('android', 'ios')),
  CONSTRAINT "devices_locale_known"
    CHECK ("locale" IN ('en', 'pt-BR')),
  -- A state and the instant it happened are one fact. A row carrying half of it is a row nobody
  -- can audit afterwards.
  CONSTRAINT "devices_approved_has_instant"
    CHECK ("status" <> 'approved' OR "approved_at" IS NOT NULL),
  CONSTRAINT "devices_revoked_has_instant"
    CHECK ("status" <> 'revoked' OR "revoked_at" IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS "devices_user_id_install_id_key"
  ON "devices" ("user_id", "install_id");

CREATE INDEX IF NOT EXISTS "devices_user_id_last_seen_at_idx"
  ON "devices" ("user_id", "last_seen_at" DESC);

CREATE INDEX IF NOT EXISTS "devices_status_registered_at_idx"
  ON "devices" ("status", "registered_at");

CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" text PRIMARY KEY NOT NULL,
  "seq" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "user_id" text NOT NULL,
  "kind" text NOT NULL,
  "subject_id" text NOT NULL,
  "subject_label" text NOT NULL,
  "at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "audit_events_kind_known"
    CHECK ("kind" IN ('device.registered', 'device.approved', 'device.revoked', 'device.expired'))
);

CREATE INDEX IF NOT EXISTS "audit_events_user_id_seq_idx"
  ON "audit_events" ("user_id", "seq" DESC);

CREATE INDEX IF NOT EXISTS "audit_events_subject_id_seq_idx"
  ON "audit_events" ("subject_id", "seq" DESC);

CREATE OR REPLACE FUNCTION "audit_events_refuse_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: UPDATE is refused'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "audit_events_refuse_recent_delete"() RETURNS trigger AS $$
BEGIN
  -- Same floor as the invocation trail, and immutable at run time for the same reason: a floor a
  -- variable can lower is not a floor.
  IF OLD."at" > now() - interval '90 days' THEN
    RAISE EXCEPTION 'audit_events is retained for 90 days: DELETE is refused'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "audit_events_no_update" ON "audit_events";
CREATE TRIGGER "audit_events_no_update"
  BEFORE UPDATE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "audit_events_refuse_update"();

DROP TRIGGER IF EXISTS "audit_events_retention_floor" ON "audit_events";
CREATE TRIGGER "audit_events_retention_floor"
  BEFORE DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "audit_events_refuse_recent_delete"();
