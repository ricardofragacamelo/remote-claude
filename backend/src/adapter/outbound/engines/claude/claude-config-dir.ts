import os from 'node:os';
import path from 'node:path';

/**
 * The configuration directory the Claude CLI reads: `CLAUDE_CONFIG_DIR` when it names one, or
 * `~/.claude` — the same fallback the CLI itself uses. Shared by whatever needs to find the
 * installation's own files without spawning anything: the diagnostic's own facts (plan 13, B-11)
 * and the synthetic skills plugin's sources (plan 13, B-35).
 */
export function effectiveClaudeConfigDir(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  homedir: () => string = os.homedir,
): { readonly path: string; readonly fromEnvironment: boolean } {
  const configured = environment['CLAUDE_CONFIG_DIR']?.trim() ?? '';
  return configured === ''
    ? { path: path.join(homedir(), '.claude'), fromEnvironment: false }
    : { path: configured, fromEnvironment: true };
}
