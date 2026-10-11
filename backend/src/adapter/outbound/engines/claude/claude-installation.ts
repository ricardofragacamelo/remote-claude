import { readAgentSdkVersion, readBundledCliVersion } from './cli-version';
import type { BundledVersion, EntryResolver } from './cli-version';

/**
 * What this installation of the engine is made of, read once from the files that pin it: the CLI
 * binary the SDK spawns, and the SDK itself — each a version, or why there is none. What the engine
 * describes itself with, and what the "About" screen lists (plan 06, B-12; plan 28, B-34).
 */
export interface ClaudeInstallation {
  readonly cli: BundledVersion;
  readonly sdk: BundledVersion;
}

/**
 * Both readings, from the manifest and the `package.json` of the SDK — nothing is spawned.
 *
 * @param entry where the SDK resolves from
 */
export function readClaudeInstallation(entry?: EntryResolver): ClaudeInstallation {
  return { cli: readBundledCliVersion(entry), sdk: readAgentSdkVersion(entry) };
}

/** DI token of the {@link ClaudeInstallation} read once, when the container was built. */
export const CLAUDE_INSTALLATION = Symbol('ClaudeInstallation');
