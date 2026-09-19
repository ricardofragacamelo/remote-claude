-- The history of what was asked of a human, and how it ended.
--
-- It is a **history**, not a trail, and the difference decides the shape of the table. The
-- append-only record of what was *executed* is `audit_entries`, and nothing here touches it. This
-- one is written twice for the same row: once when the question is put to somebody, once when it
-- is settled. That second write is the same fact reaching its conclusion — not a record being
-- rewritten — so there is no trigger refusing UPDATE here, and there should not be.
--
-- Writing the request when it is *opened* rather than only when it is answered is the point of the
-- first write: otherwise every request still open when the process dies would leave no trace at
-- all, and that is exactly the set somebody investigating an incident is looking for.
--
-- The id is the SDK's `requestId`. It is the idempotency key of the whole flow — never the
-- `tool_use_id`, which the SDK does not always give and which is not unique across a redelivery.
--
-- Reversal plan:
--   DROP TABLE "permission_requests";
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

CREATE TABLE IF NOT EXISTS "permission_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "session_id" text NOT NULL,
  "tool_use_id" text,
  "tool_name" text NOT NULL,
  "input" jsonb NOT NULL,
  "risk_hint" text NOT NULL,
  "status" text NOT NULL,
  "decision" text,
  "reason" text,
  "scope" text,
  "resolved_by" text,
  "resolved_from" text,
  "auto" boolean,
  "extensions_used" integer NOT NULL DEFAULT 0,
  "requested_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "resolved_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "permission_requests_status_known"
    CHECK ("status" IN ('pending', 'resolved', 'expired')),
  CONSTRAINT "permission_requests_decision_known"
    CHECK ("decision" IS NULL OR "decision" IN ('allow', 'deny')),
  CONSTRAINT "permission_requests_risk_hint_known"
    CHECK ("risk_hint" IN ('read', 'write', 'destructive')),
  -- Silence never authorises, and the database says so too: a decision nobody made can only ever
  -- be a refusal. It is a constraint rather than a comment because this is the one invariant of
  -- the product that must survive a bug of ours.
  CONSTRAINT "permission_requests_auto_allow_needs_author"
    CHECK ("auto" IS NOT TRUE OR "decision" IS DISTINCT FROM 'allow' OR "resolved_by" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "permission_requests_session_id_requested_at_idx"
  ON "permission_requests" ("session_id", "requested_at" DESC);

CREATE INDEX IF NOT EXISTS "permission_requests_user_id_requested_at_idx"
  ON "permission_requests" ("user_id", "requested_at" DESC);
