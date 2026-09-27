import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * The version of the CLI binary the Agent SDK ships and spawns, or `null` when it cannot be read.
 *
 * Needed **before** the first turn: the CLI reports its own version only in `system:init`, and that
 * message does not arrive until a prompt does — measured, a session left idle for four seconds
 * emitted nothing, while `supportedCommands()` answered in half a second. A menu opened on a fresh
 * session is the ordinary case, so the catalogue needs a version from the start.
 *
 * It is read from the SDK's own `manifest.json`, the file that pins the binary it spawns (with a
 * checksum per platform). That is the binary this product runs — the backend never sets
 * `pathToClaudeCodeExecutable` — and never the `claude` on `PATH`, which is often another version
 * ([D-05](../../../../../docs/plans/04-transcript-and-resume/decisions.md#d-05--o-menu-é-descoberta-não-fronteira)).
 * The runner still takes the CLI's own word over this once `system:init` arrives, and says so when
 * they differ.
 *
 * The manifest is found by walking up from the resolved entry point to the package's root — the
 * first directory with a `package.json` — and no further: the package's `exports` map does not
 * publish it, asking for a subpath a package chose not to export is a resolution error, and a
 * `manifest.json` above the package would be somebody else's.
 *
 * @param entry where the SDK resolves from — injectable so a test can point it at a directory it made
 */
export function bundledCliVersion(
  entry: () => string = () =>
    createRequire(import.meta.url).resolve('@anthropic-ai/claude-agent-sdk'),
): string | null {
  let directory: string;

  try {
    directory = path.dirname(entry());
  } catch {
    // No SDK to resolve means no session could open either; the version is the least of it, and
    // the runner falls back to what `system:init` reports.
    return null;
  }

  for (;;) {
    if (existsSync(path.join(directory, 'package.json'))) {
      const manifest = path.join(directory, 'manifest.json');
      return existsSync(manifest) ? versionIn(manifest) : null;
    }

    const parent = path.dirname(directory);
    if (parent === directory) {
      return null;
    }
    directory = parent;
  }
}

/** The `version` a manifest declares, or `null` when the file is not the manifest we expect. */
function versionIn(manifest: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : null;
  } catch {
    return null;
  }
}

/** DI token of the version {@link bundledCliVersion} read, once, when the container was built. */
export const BUNDLED_CLI_VERSION = Symbol('BundledCliVersion');
