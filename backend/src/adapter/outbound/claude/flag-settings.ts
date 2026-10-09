import type { Settings } from '@anthropic-ai/claude-agent-sdk';

/**
 * The keys the flag layer may carry. Nothing else, ever.
 *
 * The flag layer (`Options.settings`, `--settings`) sits **above** the user's and the project's
 * settings and takes `permissions`, `hooks`, `env`, `enabledPlugins` and the keys of MCP — every one
 * of them a way to decide an approval somewhere other than `canUseTool`. So it is built here, from an
 * allowlist, and `pnpm scan:security` refuses a `settings:` in the Claude adapter that does not come
 * from this function (ADR-018):
 *
 * - `outputStyle` — the only way the SDK offers to choose one (plan 13, D-06); measured to apply at
 *   the start without losing the hooks, which `applyFlagSettings` mid-session does lose (§10.3);
 * - `disableSkillShellExecution` — always `true`: the `!` blocks of a skill or a slash command run on
 *   expansion with no `canUseTool` and no `PreToolUse`, and `managedSettings` was measured not to stop
 *   them; this does, for every source (plan 13, D-21, D-24).
 */
export const FLAG_SETTINGS_KEYS = ['outputStyle', 'disableSkillShellExecution'] as const;

export type FlagSettingsKey = (typeof FLAG_SETTINGS_KEYS)[number];

/** What a session may choose for the flag layer. The rest is not a choice. */
export interface FlagSettingsInput {
  readonly outputStyle?: string | null;
}

/** Raised when something other than this builder's keys would reach the flag layer. */
export class UnsafeFlagSettingsError extends Error {
  constructor(keys: readonly string[]) {
    super(`refusing flag settings outside the allowlist: ${keys.join(', ')}`);
    this.name = 'UnsafeFlagSettingsError';
  }
}

/**
 * The flag settings of a session or a probe: the shell inline off, and the output style when one
 * was chosen.
 *
 * @throws {UnsafeFlagSettingsError} a key outside the allowlist was handed in — a programming error,
 *   since the input type does not have one
 */
export function flagSettings(input: FlagSettingsInput = {}): Settings {
  assertAllowed(Object.keys(input));

  return {
    disableSkillShellExecution: true,
    ...(input.outputStyle == null ? {} : { outputStyle: input.outputStyle }),
  };
}

/**
 * Refuses keys the flag layer must never carry — what the query factory asks of the options it is
 * handed, so a `settings` built anywhere else stops before a subprocess exists.
 *
 * @throws {UnsafeFlagSettingsError}
 */
export function assertAllowed(keys: readonly string[]): void {
  const refused = keys.filter((key) => !(FLAG_SETTINGS_KEYS as readonly string[]).includes(key));

  if (refused.length > 0) {
    throw new UnsafeFlagSettingsError(refused);
  }
}
