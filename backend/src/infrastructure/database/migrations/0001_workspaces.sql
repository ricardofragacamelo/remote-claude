-- The `workspaces` table: which root a user reached, and when.
--
-- Metadata only. No file content ever goes into this database — the allowlist file says what a
-- root is, and this table says only that somebody used one.
--
-- `user_id` is NOT NULL from the first migration because the product is multi-user from day one
-- (docs/plans/01-live-session/decisions.md#d-03). Retrofitting scope later is a data migration;
-- here it is one column.
--
-- Reversal plan: DROP TABLE "workspaces";
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

CREATE TABLE IF NOT EXISTS "workspaces" (
  "user_id" text NOT NULL,
  "root_path" text NOT NULL,
  "label" text NOT NULL,
  "last_used_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "workspaces_pkey" PRIMARY KEY ("user_id", "root_path")
);

CREATE INDEX IF NOT EXISTS "workspaces_user_id_last_used_at_idx"
  ON "workspaces" ("user_id", "last_used_at" DESC);
