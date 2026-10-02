/**
 * The files of a folder that change what Claude may do — the list is the domain's
 * (`backend/src/domain/files/services/sensitive-files.ts`), and this is the web's copy of it: an
 * `allow` rule in the project settings goes past the permission prompt in a trusted folder, and a
 * hook there is code that runs in the next session
 * ([07 · D-15](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-15--arquivos-que-mudam-a-permissão)).
 *
 * In `shared/` because the editor (saving), the explorer (renaming, moving, deleting) and the
 * Claude settings of plan 11 all ask the second step for the same files. The server refuses without
 * the confirmation either way (`428`, `reason: sensitiveFile`): this list only lets the screen ask
 * first, and say **what** the file controls.
 */
export const SENSITIVE_FILES = {
  '.claude/settings.json': 'claudeSettings',
  '.claude/settings.local.json': 'claudeLocalSettings',
  '.mcp.json': 'mcpServers',
} as const;

/** What a sensitive file controls — the last segment of the key its explanation is under. */
export type SensitiveSubject = (typeof SENSITIVE_FILES)[keyof typeof SENSITIVE_FILES];

/** What a path relative to the open folder controls, when it is one of the files — `null` otherwise. */
export function sensitiveSubject(relative: string): SensitiveSubject | null {
  return Object.hasOwn(SENSITIVE_FILES, relative)
    ? SENSITIVE_FILES[relative as keyof typeof SENSITIVE_FILES]
    : null;
}

/**
 * Whether an operation on `relative` reaches one of them — the file itself, or a folder that holds
 * one: moving or deleting `.claude` takes `.claude/settings.json` with it.
 */
export function touchesSensitive(relative: string): boolean {
  return Object.keys(SENSITIVE_FILES).some(
    (sensitive) => sensitive === relative || sensitive.startsWith(`${relative}/`),
  );
}
