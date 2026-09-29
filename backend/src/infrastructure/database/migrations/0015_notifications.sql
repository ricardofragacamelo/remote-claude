-- The history of each user's notification centre: `notifications` (plan 06, B-40).
--
-- It lives on the server so it follows the user between devices and survives a reload, and "read"
-- lives here with it: marked on the desktop, read on the phone (06 · D-17). Thirty days, at most two
-- hundred per user — the purge job and the recording keep both.
--
-- A key and its parameters, never the content of a conversation and never a command: the same rule
-- as the push. The key comes from a closed catalogue the backend checks before writing.
--
-- The id is a ULID minted by the domain; `seq` is what the pages are cut on, because two entries
-- land in the same millisecond. `(user_id, client_id)` is unique: a client that never got the
-- answer sends the same entry again, and it stays one. `created_at` has no default on purpose — it
-- is stamped by the application's clock, and the retention is counted from it.
--
-- Indexes, each with the query it serves: `(user_id, seq DESC)` for the pages, `created_at` for the
-- purge, and the unique pair for the idempotent recording.
--
-- Reversal plan:
--   DROP TABLE "notifications";
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" text PRIMARY KEY NOT NULL,
  "seq" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "user_id" text NOT NULL,
  "client_id" text NOT NULL,
  "severity" text NOT NULL,
  "message_key" text NOT NULL,
  "params" jsonb NOT NULL,
  "count" integer NOT NULL,
  "created_at" timestamptz NOT NULL,
  "read_at" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "notifications_severity_known" CHECK ("severity" IN ('info', 'warning', 'error')),
  CONSTRAINT "notifications_count_positive" CHECK ("count" >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_user_id_client_id_key"
  ON "notifications" ("user_id", "client_id");

CREATE INDEX IF NOT EXISTS "notifications_user_id_seq_idx"
  ON "notifications" ("user_id", "seq" DESC);

CREATE INDEX IF NOT EXISTS "notifications_created_at_idx"
  ON "notifications" ("created_at");
