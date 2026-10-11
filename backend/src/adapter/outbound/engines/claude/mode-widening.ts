/**
 * How far each mode the CLI can run a call in reaches without asking anybody — the lower, the
 * narrower.
 *
 * `plan` only plans and `dontAsk` refuses whatever is not already approved: both ask less of a
 * person and allow less. `default` asks. `acceptEdits` writes without asking, `auto` lets a
 * classifier approve, `bypassPermissions` approves everything.
 */
const REACH: Readonly<Record<string, number>> = {
  plan: 0,
  dontAsk: 0,
  default: 1,
  acceptEdits: 2,
  auto: 3,
  bypassPermissions: 4,
};

/** What a mode this build does not know reaches: as far as any — it fails closed. */
const UNKNOWN_REACH = Number.POSITIVE_INFINITY;

/**
 * Whether a call runs under a mode wider than the session's own.
 *
 * A project's subagent can declare `permissionMode: acceptEdits` in its frontmatter, and the CLI
 * honours it: measured, its `Write` reached the `PreToolUse` hook with `permission_mode:
 * 'acceptEdits'` and never reached `canUseTool` — a cloned repository switching the approval off in
 * silence. When this answers `true`, the hook answers `ask`, and the call goes back to the person
 * (plan 13, D-23).
 *
 * @param sessionMode the mode the SDK runs the session in — Permitir tudo reaches it as `default`
 * @param callMode the `permission_mode` the hook was given, or nothing when the CLI did not say
 */
export function widensSessionMode(sessionMode: string, callMode: string | undefined): boolean {
  if (callMode === undefined) {
    return false;
  }

  return (REACH[callMode] ?? UNKNOWN_REACH) > (REACH[sessionMode] ?? UNKNOWN_REACH);
}
