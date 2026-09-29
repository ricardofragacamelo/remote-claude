-- The folders a user opened: `workspace_folders` (plan 06, B-09).
--
-- One row per folder, and it is two things at once: a recent folder, and — while its tab is open —
-- a folder tab. "This person opened this folder" is one fact; two tables would be two rows for it
-- that disagree the first time one is written and the other is not (06 · D-14). A folder and not a
-- root, so `workspaces`, which says which root was used, does not change.
--
-- Metadata only: a path and when. No listing and no file content ever goes into this database.
--
-- `user_id` is NOT NULL and part of the key from the first migration, like `workspaces`: the
-- product is multi-user from day one (01 · D-03). The key `(user_id, path)` is the identity, so
-- opening the same folder twice, or from two windows at once, updates a row instead of adding one;
-- it is also the index every query reads, since every query is "the folders of one user".
--
-- The checks say in the database what the domain keeps: a row that is neither recent nor open is
-- not kept, a pinned folder is on the recent list, and a tab position is not negative.
--
-- Reversal plan:
--   DROP TABLE "workspace_folders";
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

CREATE TABLE IF NOT EXISTS "workspace_folders" (
  "user_id" text NOT NULL,
  "path" text NOT NULL,
  "root_path" text NOT NULL,
  "last_opened_at" timestamptz,
  "is_pinned" boolean NOT NULL DEFAULT false,
  "tab_position" integer,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_folders_pkey" PRIMARY KEY ("user_id", "path"),
  CONSTRAINT "workspace_folders_recent_or_open"
    CHECK ("last_opened_at" IS NOT NULL OR "tab_position" IS NOT NULL),
  CONSTRAINT "workspace_folders_pinned_is_recent"
    CHECK (NOT "is_pinned" OR "last_opened_at" IS NOT NULL),
  CONSTRAINT "workspace_folders_tab_position_positive" CHECK ("tab_position" >= 0)
);
