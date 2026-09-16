-- The `sessions` table of the walking skeleton.
--
-- Reversal plan: DROP TABLE "sessions";
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL,
  "opened_at" timestamptz NOT NULL,
  "last_pinged_at" timestamptz NOT NULL,
  "ping_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "sessions_ping_count_non_negative" CHECK ("ping_count" >= 0)
);

CREATE INDEX IF NOT EXISTS "sessions_owner_id_idx" ON "sessions" ("owner_id");
