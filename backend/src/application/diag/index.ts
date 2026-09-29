/** Public surface of the `diag` use cases: the gateway round trip that needs no Claude. */
export { PingDiagUseCase } from './ping-diag.use-case';
export type { PingDiagCommand } from './commands/ping-diag.command';
export type { DiagSessionRepository } from './ports/diag-session.repository';
export { DIAG_SESSION_REPOSITORY } from './ports/diag-session.repository';
export { ReadVersionsUseCase } from './read-versions.use-case';
export type {
  ComponentVersion,
  InstallationVersions,
  InstallationVersionSource,
  VersionUnavailableReason,
} from './ports/installation-versions.port';
export { INSTALLATION_VERSION_SOURCE } from './ports/installation-versions.port';
