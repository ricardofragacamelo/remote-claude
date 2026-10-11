-- The permission modes are the canonical ones — `ask`, `acceptEdits`, `readOnly`, `allowAll` — and no
-- longer the CLI's (plan 28, B-26, D-16). One table stores a mode: the defaults of `claude_defaults`.
-- Its values are renamed (`default` → `ask`, `plan` → `readOnly`; `acceptEdits` and `allowAll` keep
-- their names) and its CHECK says the new set. `bypassPermissions` was never allowed there.
--
-- Idempotent: the old CHECK is dropped only if present, the renaming touches only the old names, and
-- the new CHECK is added only if missing — run twice, it changes nothing the second time (S-80).
--
-- Reversal plan:
--   ALTER TABLE "claude_defaults" DROP CONSTRAINT IF EXISTS "claude_defaults_mode_canonical";
--   UPDATE "claude_defaults" SET "permission_mode" = 'default' WHERE "permission_mode" = 'ask';
--   UPDATE "claude_defaults" SET "permission_mode" = 'plan' WHERE "permission_mode" = 'readOnly';
--   ALTER TABLE "claude_defaults" ADD CONSTRAINT "claude_defaults_mode_known"
--     CHECK ("permission_mode" IN ('default', 'acceptEdits', 'plan', 'allowAll'));
--
-- Never edit this file once it has been applied anywhere — create the next one instead.

ALTER TABLE "claude_defaults" DROP CONSTRAINT IF EXISTS "claude_defaults_mode_known";

UPDATE "claude_defaults" SET "permission_mode" = 'ask' WHERE "permission_mode" = 'default';
UPDATE "claude_defaults" SET "permission_mode" = 'readOnly' WHERE "permission_mode" = 'plan';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'claude_defaults_mode_canonical'
  ) THEN
    ALTER TABLE "claude_defaults" ADD CONSTRAINT "claude_defaults_mode_canonical"
      CHECK ("permission_mode" IN ('ask', 'acceptEdits', 'readOnly', 'allowAll'));
  END IF;
END $$;
