/**
 * How a session treats a tool invocation.
 *
 * The four the SDK names, plus `allowAll` — Permitir tudo — which is ours
 * ([ADR-022](../../../../../docs/architecture/shared/00-decisions.md)). `bypassPermissions` is in the
 * list because the SDK has it and a client may ask for it; whether it is **honoured** is not this
 * type's business — `allowDangerouslySkipPermissions` stays `false` always, so asking for it does
 * not turn the approval off. See docs/architecture/backend/04-claude-integration.md.
 */
export const PERMISSION_MODES = [
  'default',
  'acceptEdits',
  'bypassPermissions',
  'plan',
  'allowAll',
] as const;

export type PermissionMode = (typeof PERMISSION_MODES)[number];

/** The modes the SDK itself knows — every mode but the one that is ours. */
export type SdkPermissionMode = Exclude<PermissionMode, 'allowAll'>;

/** Whether a string names a mode this build knows. */
export function isPermissionMode(value: string): value is PermissionMode {
  return (PERMISSION_MODES as readonly string[]).includes(value);
}

/**
 * The mode the SDK is told, for the mode a session is in.
 *
 * `allowAll` reaches it as `default`, and that is the whole design of Permitir tudo: the CLI keeps
 * calling `canUseTool` for every tool, so a `deny` of ours still refuses, every approval is still
 * recorded, and switching the mode off takes effect on the very next tool. The SDK's own
 * `bypassPermissions` would skip the callback, and none of that would hold.
 */
export function sdkPermissionMode(mode: PermissionMode): SdkPermissionMode {
  return mode === 'allowAll' ? 'default' : mode;
}
