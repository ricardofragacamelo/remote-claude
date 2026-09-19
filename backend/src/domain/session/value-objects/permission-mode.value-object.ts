/**
 * How the Agent SDK treats a tool invocation.
 *
 * The four the contract carries, and the same four the SDK names. `bypassPermissions` is in the
 * list because the SDK has it and a client may ask for it; whether it is **honoured** is not this
 * type's business — `allowDangerouslySkipPermissions` stays `false` always, so asking for it does
 * not turn the approval off. See docs/architecture/backend/04-claude-integration.md.
 */
export const PERMISSION_MODES = ['default', 'acceptEdits', 'bypassPermissions', 'plan'] as const;

export type PermissionMode = (typeof PERMISSION_MODES)[number];

/** Whether a string names a mode this build knows. */
export function isPermissionMode(value: string): value is PermissionMode {
  return (PERMISSION_MODES as readonly string[]).includes(value);
}
