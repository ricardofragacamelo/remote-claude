/**
 * How a session treats a tool invocation — the canonical modes (plan 28, D-16), the same for every
 * engine:
 *
 * - `ask` — every call that needs leave asks;
 * - `acceptEdits` — file edits are accepted, the rest asks;
 * - `readOnly` — nothing changes: our gate refuses every write and every shell, and the engine's own
 *   mode is the second layer (plan 28, B-26);
 * - `allowAll` — Permitir tudo, ours: every call no rule refuses is allowed, but questions and plans
 *   ([ADR-022](../../../../../docs/architecture/shared/00-decisions.md)).
 *
 * Each engine's adapter translates them to its own; an engine announces which it has in
 * `capabilities.permissionModes`.
 */
export const PERMISSION_MODES = ['ask', 'acceptEdits', 'readOnly', 'allowAll'] as const;

export type PermissionMode = (typeof PERMISSION_MODES)[number];

/** Whether a string names a mode this build knows. */
export function isPermissionMode(value: string): value is PermissionMode {
  return (PERMISSION_MODES as readonly string[]).includes(value);
}

/**
 * The canonical mode of a name the previous protocol, an old configuration or a stored choice used —
 * `default` is `ask`, `plan` is `readOnly` — or the name itself when it already is one, `null` when it
 * names none (a mode that skips asking included, which was never honoured). Read once, at the edge.
 */
export function canonicalPermissionMode(value: string): PermissionMode | null {
  // A map, not an object literal: `toString` or `constructor` would answer from its prototype.
  const previous = new Map<string, PermissionMode>([
    ['default', 'ask'],
    ['plan', 'readOnly'],
  ]);
  return previous.get(value) ?? (isPermissionMode(value) ? value : null);
}
