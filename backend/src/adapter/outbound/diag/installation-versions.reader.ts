import { fileURLToPath } from 'node:url';

import type {
  ComponentVersion,
  InstallationVersions,
  InstallationVersionSource,
} from '@application/diag';
import {
  readAgentSdkVersion,
  readBundledCliVersion,
  readPackageVersion,
} from '@adapter/outbound/claude/cli-version';
import type { BundledVersion } from '@adapter/outbound/claude/cli-version';

/** How each version is read — injectable, so a test can make any one of them unreadable. */
export interface VersionReaders {
  readonly backend: () => BundledVersion;
  readonly agentSdk: () => BundledVersion;
  readonly claudeCli: () => BundledVersion;
  readonly node: () => string;
}

const thisFile = (): string => fileURLToPath(import.meta.url);

const defaultReaders: VersionReaders = {
  // This backend's own package, found by walking up from this very file.
  backend: () => readPackageVersion(thisFile),
  agentSdk: () => readAgentSdkVersion(),
  claudeCli: () => readBundledCliVersion(),
  node: () => process.versions.node,
};

/**
 * The versions of this installation, read once and kept.
 *
 * Nothing here spawns anything: the CLI's version comes from the manifest the SDK pins it by —
 * the same reading the command catalogue does — so asking for the "About" screen a hundred times
 * costs one read of two small files (plan 06, S-68).
 */
export class InstallationVersionReader implements InstallationVersionSource {
  private cached: InstallationVersions | null = null;

  constructor(private readonly readers: VersionReaders = defaultReaders) {}

  read(): InstallationVersions {
    this.cached ??= {
      backend: component(this.readers.backend()),
      agentSdk: component(this.readers.agentSdk()),
      claudeCli: component(this.readers.claudeCli()),
      node: { version: this.readers.node(), reason: null },
    };

    return this.cached;
  }
}

function component(read: BundledVersion): ComponentVersion {
  return { version: read.version, reason: read.reason };
}
