/** Why a version could not be read. A code, never prose: the client says it in its language. */
export type VersionUnavailableReason = 'notInstalled' | 'unreadable';

/** One component's version, or why there is none. */
export interface ComponentVersion {
  readonly version: string | null;
  /** Set exactly when `version` is `null`. */
  readonly reason: VersionUnavailableReason | null;
}

/** One engine enabled, as it describes itself: its name, whether it can open a session, its parts. */
export interface EngineVersions {
  /** The engine, by the name its port registers. */
  readonly engine: string;

  /** Its own name, a proper noun — never translated. */
  readonly displayName: string;
  readonly state: 'available' | 'unavailable';

  /** The binary its adapter drives. */
  readonly binary: ComponentVersion;

  /** The library the adapter drives it through — `null` for an engine driven with none. */
  readonly library: ComponentVersion | null;
}

/**
 * What somebody pastes into a bug report: the versions this installation runs — its own, Node's,
 * and each engine's, as the engine describes itself (plan 28, B-37).
 */
export interface InstallationVersions {
  readonly backend: ComponentVersion;
  readonly node: ComponentVersion;

  /** The engine a session opens on when the client names none — one of {@link engines}. */
  readonly defaultEngine: string;

  /** One per engine enabled, in the order the configuration lists them (S-108). */
  readonly engines: readonly EngineVersions[];
}

/**
 * Where the versions come from.
 *
 * Read once and kept: none of them changes while the process runs, and the costly ones — the
 * engines' — come from what each engine describes itself with, never by spawning one (plan 06, S-68).
 * It never throws: a version it cannot read is `null` with the reason, because the screen that shows
 * them exists precisely for when something is wrong (S-66).
 */
export interface InstallationVersionSource {
  read(): InstallationVersions;
}

export const INSTALLATION_VERSION_SOURCE = Symbol('InstallationVersionSource');
