-- That we opened a conversation of Claude, for whom, and where: `session_origins`.
--
-- Provenance, not content. The transcript stays in Claude's JSONL and is never copied into this
-- database. The SDK reports no origin for a session, and this row is what tells a conversation this
-- backend opened from one the editor or the terminal did — which decides whose it is and, later,
-- whether a resume may write into it or has to fork it.
--
-- The key is the conversation's id in Claude's store: a UUID minted by the backend and handed to
-- the SDK, so recording the same conversation twice conflicts instead of adding a row.
--
-- The lookup is always by that key (the history asks "which of these are ours?"), which the primary
-- key serves; the index on `session_id` is for going from a live session to its conversation.
--
-- Reversal plan:
--   DROP TABLE "session_origins";
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

CREATE TABLE IF NOT EXISTS "session_origins" (
  "claude_session_id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL,
  "user_id" text NOT NULL,
  "workspace_path" text NOT NULL,
  "opened_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "session_origins_session_id_idx"
  ON "session_origins" ("session_id");
