/**
 * Files that change what Claude may do — a rule `allow` in the project settings goes past
 * `canUseTool` in a trusted folder, and a hook there is code that runs in the next session.
 *
 * Editable, with a second step: writing, creating, moving or deleting one of them needs the
 * explicit confirmation, and the trail marks the fact `sensitive`
 * ([07 · D-15](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-15--arquivos-que-mudam-a-permissão)).
 * Plan 11 reuses the same list for its own screen.
 */
export const SENSITIVE_FILES = [
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.mcp.json',
] as const;

/**
 * Whether a path relative to the open folder is one of them.
 *
 * Relative to the open folder, because that is where Claude reads a project's settings from: the
 * session's `cwd` is the folder of the tab.
 */
export function isSensitive(relative: string): boolean {
  return (SENSITIVE_FILES as readonly string[]).includes(relative);
}

/**
 * Whether an operation on `relative` reaches one of them — the file itself, or a folder that holds
 * one: deleting or moving `.claude` takes `.claude/settings.json` with it, and passes through the
 * same step.
 */
export function touchesSensitive(relative: string): boolean {
  return SENSITIVE_FILES.some(
    (sensitive) => sensitive === relative || sensitive.startsWith(`${relative}/`),
  );
}
