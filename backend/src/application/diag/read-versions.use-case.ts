import type {
  InstallationVersions,
  InstallationVersionSource,
} from './ports/installation-versions.port';

/**
 * The versions of this installation, for the "About" screen (plan 06, B-12).
 *
 * Always an answer: a component whose version could not be read comes back `null` with the reason,
 * and the request still succeeds — a screen that failed whenever the CLI was missing would fail
 * exactly when somebody needs it.
 */
export class ReadVersionsUseCase {
  constructor(private readonly versions: InstallationVersionSource) {}

  execute(): InstallationVersions {
    return this.versions.read();
  }
}
