/** Why a version could not be read. A code, never prose: the client says it in its language. */
export type VersionUnavailableReason = 'notInstalled' | 'unreadable';

/** One component's version, or why there is none. */
export interface ComponentVersion {
  readonly version: string | null;
  /** Set exactly when `version` is `null`. */
  readonly reason: VersionUnavailableReason | null;
}

/** What somebody pastes into a bug report: the versions this installation runs. */
export interface InstallationVersions {
  readonly backend: ComponentVersion;
  readonly agentSdk: ComponentVersion;
  readonly claudeCli: ComponentVersion;
  readonly node: ComponentVersion;
}

/**
 * Where the versions come from.
 *
 * Read once and kept: none of them changes while the process runs, and the one that is costly to
 * ask — the CLI's — is read from the file that pins it, never by spawning the CLI (plan 06, S-68).
 * It never throws: a version it cannot read is `null` with the reason, because the screen that shows
 * them exists precisely for when something is wrong (S-66).
 */
export interface InstallationVersionSource {
  read(): InstallationVersions;
}

export const INSTALLATION_VERSION_SOURCE = Symbol('InstallationVersionSource');
