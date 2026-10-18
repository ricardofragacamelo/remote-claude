import { tmpdir } from 'node:os';
import { z } from 'zod';

import { CLAUDE_ENGINE } from '@adapter/outbound/engines/claude/claude-engine';
import { parseEnvironment } from '@remote-claude/config';
import type { EngineEnvironment, RawEnvironment } from '../../config/environment';

/**
 * The variables only the engine `claude` reads (plan 28, B-37), validated at boot with the core's.
 * No default, like every variable of the backend.
 */
const claudeEnvironmentSchema = z.object({
  // The model a Claude session opens with when nobody chose one — the variable of before plan 28,
  // read as Claude's: a model is one engine's word.
  RC_SESSION_DEFAULT_MODEL: z.string().min(1),
  // The ceiling of the test of the connection, the one thing of plan 13 that spends quota (D-08).
  RC_MODEL_CHECK_MAX_BUDGET_USD: z.coerce.number().positive().max(1),
});

/** What the extension of `claude` is configured with. */
export interface ClaudeSettings {
  readonly defaultModel: string;
  readonly modelCheck: { readonly maxBudgetUsd: number; readonly cwd: string };
}

/**
 * Validates the variables of `claude`, or refuses to produce its settings.
 *
 * @throws {import('@remote-claude/config').ConfigurationError} listing every problem at once
 */
export function loadClaudeSettings(source: RawEnvironment): ClaudeSettings {
  const env = parseEnvironment(claudeEnvironmentSchema, source);

  return {
    defaultModel: env.RC_SESSION_DEFAULT_MODEL,
    // A folder of nobody's: the test reads no project and writes no transcript.
    modelCheck: { maxBudgetUsd: env.RC_MODEL_CHECK_MAX_BUDGET_USD, cwd: tmpdir() },
  };
}

/** The variables of `claude`, as the core validates them at boot. */
export const claudeEnvironment: EngineEnvironment = {
  engine: CLAUDE_ENGINE,
  load: (source) => ({ defaultModel: loadClaudeSettings(source).defaultModel }),
};

/** DI token of the {@link ClaudeSettings}. */
export const CLAUDE_SETTINGS = Symbol('ClaudeSettings');

/**
 * Drops a `CLAUDE_CONFIG_DIR` that is set to nothing — from the file the core loads at boot, or
 * exported by `pnpm dev`.
 *
 * `.env.example` declares it empty to mean "the default, `~/.claude`", and the core reads it that
 * way. **The Claude CLI does not**: it inherits the variable, takes the empty string for a
 * directory, finds no login there and answers every prompt with "Not logged in" as an ordinary
 * turn. The two halves also disagreed about which `.claude.json` is live, so the trust mark was
 * cleared in a file the CLI was not reading. Found by `pnpm test:e2e:live` (plan 04, F5).
 *
 * @param env the environment the CLI will inherit; a parameter so a test owns what it changes
 */
export function forgetEmptyClaudeConfigDir(env: NodeJS.ProcessEnv): void {
  if (env['CLAUDE_CONFIG_DIR']?.trim() === '') {
    delete env['CLAUDE_CONFIG_DIR'];
  }
}
