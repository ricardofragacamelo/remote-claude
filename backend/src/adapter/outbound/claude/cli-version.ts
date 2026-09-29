import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/** Why a version could not be read: nothing is installed there, or what is there is not legible. */
export type VersionUnreadable = 'notInstalled' | 'unreadable';

/** A version, or why there is none. Exactly one of the two is set. */
export type BundledVersion =
  | { readonly version: string; readonly reason: null }
  | { readonly version: null; readonly reason: VersionUnreadable };

/** Where the SDK resolves from — injectable so a test can point it at a directory it made. */
export type EntryResolver = () => string;

const sdkEntry: EntryResolver = () =>
  createRequire(import.meta.url).resolve('@anthropic-ai/claude-agent-sdk');

/**
 * The version of the CLI binary the Agent SDK ships and spawns, or why it cannot be read.
 *
 * Needed **before** the first turn: the CLI reports its own version only in `system:init`, and that
 * message does not arrive until a prompt does — measured, a session left idle for four seconds
 * emitted nothing, while `supportedCommands()` answered in half a second. A menu opened on a fresh
 * session is the ordinary case, so the catalogue needs a version from the start. The "About" screen
 * reads it the same way, and so never spawns the CLI to ask (plan 06, S-68).
 *
 * It is read from the SDK's own `manifest.json`, the file that pins the binary it spawns (with a
 * checksum per platform). That is the binary this product runs — the backend never sets
 * `pathToClaudeCodeExecutable` — and never the `claude` on `PATH`, which is often another version
 * ([D-05](../../../../../docs/plans/04-transcript-and-resume/decisions.md#d-05--o-menu-é-descoberta-não-fronteira)).
 * The runner still takes the CLI's own word over this once `system:init` arrives, and says so when
 * they differ.
 *
 * @param entry where the SDK resolves from
 */
export function readBundledCliVersion(entry: EntryResolver = sdkEntry): BundledVersion {
  const root = packageRoot(entry);

  if (root === null) {
    return missing();
  }

  const manifest = path.join(root, 'manifest.json');

  return existsSync(manifest) ? versionIn(manifest) : missing();
}

/** {@link readBundledCliVersion}, as the version alone — what the session runner needs. */
export function bundledCliVersion(entry: EntryResolver = sdkEntry): string | null {
  return readBundledCliVersion(entry).version;
}

/**
 * The version of the Agent SDK itself — the `version` of its `package.json` — or why it cannot be
 * read. What somebody pastes into a bug report beside the CLI's.
 *
 * @param entry where the SDK resolves from
 */
export function readAgentSdkVersion(entry: EntryResolver = sdkEntry): BundledVersion {
  return readPackageVersion(entry);
}

/**
 * The `version` of the package a file belongs to — the SDK's, or this backend's own.
 *
 * @param entry a file inside the package
 */
export function readPackageVersion(entry: EntryResolver): BundledVersion {
  const root = packageRoot(entry);

  return root === null ? missing() : versionIn(path.join(root, 'package.json'));
}

/**
 * The root of the package the entry belongs to — the first directory up from it with a
 * `package.json` — and no further: the package's `exports` map does not publish its manifest,
 * asking for a subpath a package chose not to export is a resolution error, and a `manifest.json`
 * above the package would be somebody else's. `null` when the SDK does not resolve at all, or no
 * directory up to the filesystem root is a package.
 */
function packageRoot(entry: EntryResolver): string | null {
  let directory: string;

  try {
    directory = path.dirname(entry());
  } catch {
    // No SDK to resolve means no session could open either; the version is the least of it.
    return null;
  }

  for (;;) {
    if (existsSync(path.join(directory, 'package.json'))) {
      return directory;
    }

    const parent = path.dirname(directory);
    if (parent === directory) {
      return null;
    }
    directory = parent;
  }
}

/** The `version` a JSON file declares, or `unreadable` when it is not the file we expect. */
function versionIn(file: string): BundledVersion {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { version?: unknown };

    return typeof parsed.version === 'string'
      ? { version: parsed.version, reason: null }
      : { version: null, reason: 'unreadable' };
  } catch {
    return { version: null, reason: 'unreadable' };
  }
}

function missing(): BundledVersion {
  return { version: null, reason: 'notInstalled' };
}

/** DI token of the version {@link bundledCliVersion} read, once, when the container was built. */
export const BUNDLED_CLI_VERSION = Symbol('BundledCliVersion');
