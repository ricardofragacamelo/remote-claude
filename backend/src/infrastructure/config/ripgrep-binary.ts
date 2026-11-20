import { access, constants } from 'node:fs/promises';
import process from 'node:process';

import { rgPath as pinnedRipgrepPath } from '@vscode/ripgrep';
import { ConfigurationError } from '@remote-claude/config';
import type { RipgrepBinary } from '@application/search';
import { allowedProcessEnv } from '@domain/search';
import { execFileText } from '@shared/process/exec-file-text';
import type { Logger } from '@shared/logging/logger';

/**
 * The lowest ripgrep this backend trusts to compile a pattern and emit `--json` the way B-08 and
 * B-10 expect — provisional, raised only if a real incompatibility is found (plan 11, B-07).
 */
export const MINIMUM_RIPGREP_VERSION = Object.freeze({ major: 13, minor: 0, patch: 0 });

interface SemanticVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

/**
 * Reads `ripgrep X.Y.Z` from the first line of `--version`'s output.
 *
 * @returns the version, or `null` when the output does not start the way ripgrep's own does
 */
export function parseRipgrepVersion(output: string): SemanticVersion | null {
  const match = /^ripgrep (\d+)\.(\d+)\.(\d+)/m.exec(output);
  if (match === null) {
    return null;
  }
  const [, major, minor, patch] = match;
  return { major: Number(major), minor: Number(minor), patch: Number(patch) };
}

/** Whether [version] is [minimum] or newer, compared field by field, most significant first. */
export function meetsMinimumVersion(version: SemanticVersion, minimum: SemanticVersion): boolean {
  if (version.major !== minimum.major) return version.major > minimum.major;
  if (version.minor !== minimum.minor) return version.minor > minimum.minor;
  return version.patch >= minimum.patch;
}

function versionText(version: SemanticVersion): string {
  return `${String(version.major)}.${String(version.minor)}.${String(version.patch)}`;
}

/**
 * Resolves and proves the ripgrep binary this backend will run — at boot, once, the way the
 * workspace allowlist is (ADR-016, [11 · D-01](../../../../docs/plans/11-search/decisions.md#d-01--de-onde-vem-o-ripgrep)).
 *
 * Never the `rg` of this process's own `PATH` — on a machine with the coding agent installed,
 * that resolves to a shell function that runs the agent's own binary with a different `argv0`
 * (measured, F0) — and never anything the agent's engine carries. [override] is
 * `RC_RIPGREP_PATH`; absent, the pinned
 * `@vscode/ripgrep` binary is used. Either way the binary must exist, be executable, run
 * `--version` within the deadline and report at least {@link MINIMUM_RIPGREP_VERSION} — any
 * failure throws, and the boot stops, exactly as a bad allowlist does: configuration that is wrong
 * never comes up quietly doing less than it says.
 *
 * @throws {ConfigurationError} naming `RC_RIPGREP_PATH` and why
 */
export async function resolveRipgrepBinary(
  override: string | null,
  logger: Logger,
): Promise<RipgrepBinary> {
  const path = override ?? pinnedRipgrepPath;

  try {
    await access(path, constants.X_OK);
  } catch {
    throw new ConfigurationError([`RC_RIPGREP_PATH: ${path} does not exist, or is not executable`]);
  }

  let output: string;
  try {
    output = await execFileText(path, ['--version'], {
      timeoutMs: 5_000,
      env: allowedProcessEnv(process.env),
    });
  } catch (error) {
    throw new ConfigurationError([
      `RC_RIPGREP_PATH: ${path} failed to run --version: ${String(error)}`,
    ]);
  }

  const version = parseRipgrepVersion(output);
  if (version === null) {
    throw new ConfigurationError([`RC_RIPGREP_PATH: ${path} did not report a ripgrep version`]);
  }
  if (!meetsMinimumVersion(version, MINIMUM_RIPGREP_VERSION)) {
    throw new ConfigurationError([
      `RC_RIPGREP_PATH: ${path} reports ripgrep ${versionText(version)}, below the minimum ` +
        versionText(MINIMUM_RIPGREP_VERSION),
    ]);
  }

  const resolved: RipgrepBinary = { path, version: versionText(version) };
  logger.info({ op: 'search.ripgrep.resolved', ...resolved }, 'ripgrep binary resolved');
  return resolved;
}
