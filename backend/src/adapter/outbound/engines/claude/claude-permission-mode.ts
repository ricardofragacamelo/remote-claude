import type { PermissionMode } from '@domain/session';

/** The modes Claude Code's SDK knows — the ones a session of ours is ever opened in. */
export type SdkPermissionMode = 'default' | 'acceptEdits' | 'plan';

/**
 * The mode the SDK is told, for the canonical mode a session is in (plan 28, B-26).
 *
 * `allowAll` reaches it as `default`, and that is the whole design of Permitir tudo: the CLI keeps
 * calling `canUseTool` for every tool, so a `deny` of ours still refuses, every approval is still
 * recorded, and switching the mode off takes effect on the very next tool. The SDK's own
 * `bypassPermissions` would skip the callback, and none of that would hold — it is never sent.
 * `readOnly` reaches it as `plan`, the CLI's own read-only mode, behind our gate, which refuses every
 * write and every shell first.
 */
const SDK_MODES: Readonly<Record<PermissionMode, SdkPermissionMode>> = {
  ask: 'default',
  acceptEdits: 'acceptEdits',
  readOnly: 'plan',
  allowAll: 'default',
};

export function sdkPermissionMode(mode: PermissionMode): SdkPermissionMode {
  return SDK_MODES[mode];
}
