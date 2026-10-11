import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  ComponentVersion,
  EngineVersions,
  InstallationVersions,
  InstallationVersionSource,
} from '@application/diag';
import type { EngineRegistry, EngineSelfDescription } from '@application/session';

/** How the versions that are not an engine's are read — injectable, so a test can break either. */
export interface VersionReaders {
  readonly backend: () => ComponentVersion;
  readonly node: () => string;
}

const defaultReaders: VersionReaders = {
  // This backend's own package, found by walking up from this very file.
  backend: () => ownPackageVersion(fileURLToPath(import.meta.url)),
  node: () => process.versions.node,
};

/** What is said of a part that is not there. */
const NOT_INSTALLED: ComponentVersion = { version: null, reason: 'notInstalled' };

/**
 * The versions of this installation, read once and kept.
 *
 * The engines' are what each engine enabled describes itself with (plan 28, B-34, B-37): the binary
 * it drives and the library it drives it through, read by its adapter from the files that pin them
 * — nothing here spawns anything, and nothing here knows which engines they are (S-100, S-108).
 * Built once, at boot, so asking for the "About" screen a hundred times costs nothing more (plan 06,
 * S-68).
 */
export class InstallationVersionReader implements InstallationVersionSource {
  private constructor(private readonly versions: InstallationVersions) {}

  /**
   * @param engines the registry every engine enabled is asked of
   * @param readers how the backend's and Node's versions are read
   */
  static async of(
    engines: EngineRegistry,
    readers: VersionReaders = defaultReaders,
  ): Promise<InstallationVersionReader> {
    const descriptions = await Promise.all(engines.all.map((engine) => engine.describe()));

    return new InstallationVersionReader({
      backend: readers.backend(),
      node: { version: readers.node(), reason: null },
      defaultEngine: engines.default.engine.value,
      engines: descriptions.map(versionsOf),
    });
  }

  read(): InstallationVersions {
    return this.versions;
  }
}

function component(read: ComponentVersion): ComponentVersion {
  return { version: read.version, reason: read.reason };
}

/** What [description] says of an engine's installation. */
function versionsOf(description: EngineSelfDescription): EngineVersions {
  const { library } = description.components;
  return {
    engine: description.engine.value,
    displayName: description.displayName,
    state: description.state,
    binary: component(description.components.binary),
    library: library === null ? null : component(library),
  };
}

/**
 * The `version` of the package [file] belongs to — the first directory up from it with a
 * `package.json` — or why there is none.
 */
export function ownPackageVersion(file: string): ComponentVersion {
  for (let directory = path.dirname(file); ; directory = path.dirname(directory)) {
    const manifest = path.join(directory, 'package.json');
    if (existsSync(manifest)) {
      return declaredVersion(manifest);
    }
    if (path.dirname(directory) === directory) {
      return NOT_INSTALLED;
    }
  }
}

/** The `version` [manifest] declares, or `unreadable` when it is not the file expected. */
function declaredVersion(manifest: string): ComponentVersion {
  try {
    const { version } = JSON.parse(readFileSync(manifest, 'utf8')) as { version?: unknown };
    return typeof version === 'string' ? { version, reason: null } : unreadable();
  } catch {
    return unreadable();
  }
}

function unreadable(): ComponentVersion {
  return { version: null, reason: 'unreadable' };
}
