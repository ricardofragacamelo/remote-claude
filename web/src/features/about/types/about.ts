/** Why a version could not be read — a code; the screen says it in the visitor's language. */
export type VersionUnavailableReason = 'notInstalled' | 'unreadable';

/** One component's version, or why there is none — never both, never neither. */
export type ComponentVersion =
  | { readonly version: string; readonly reason: null }
  | { readonly version: null; readonly reason: VersionUnavailableReason };

/** Whether an engine's installation answered at all. */
export type EngineVersionsState = 'available' | 'unavailable';

/**
 * One engine enabled, as the "About" screen lists it: its binary and the library it drives it
 * through — the library is `null` for an engine that has none to report (plan 28, B-37).
 */
export interface EngineVersions {
  readonly engine: string;
  readonly displayName: string;
  readonly state: EngineVersionsState;
  readonly binary: ComponentVersion;
  readonly library: ComponentVersion | null;
}

/** What somebody pastes into a bug report: the versions this installation runs. */
export interface InstallationVersions {
  readonly backend: ComponentVersion;
  readonly node: ComponentVersion;

  /** A line per engine enabled — never one fixed shape, so a second engine needs nothing here. */
  readonly engines: readonly EngineVersions[];
}
