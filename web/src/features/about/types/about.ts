/** Why a version could not be read — a code; the screen says it in the visitor's language. */
export type VersionUnavailableReason = 'notInstalled' | 'unreadable';

/** One component's version, or why there is none — never both, never neither. */
export type ComponentVersion =
  | { readonly version: string; readonly reason: null }
  | { readonly version: null; readonly reason: VersionUnavailableReason };

/** The components of the installation whose versions the backend reads. */
export const INSTALLATION_COMPONENTS = ['backend', 'agentSdk', 'claudeCli', 'node'] as const;

export type InstallationComponent = (typeof INSTALLATION_COMPONENTS)[number];

/** What somebody pastes into a bug report: the versions this installation runs. */
export type InstallationVersions = Readonly<Record<InstallationComponent, ComponentVersion>>;
