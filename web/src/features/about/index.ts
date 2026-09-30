/** Public surface of the `about` feature — the versions of the installation, the project, the license. */
export { AboutScreen, DOCUMENTATION_URL } from './components/AboutScreen';
export { versionKeys } from './hooks/useVersions';
export type {
  ComponentVersion,
  InstallationComponent,
  InstallationVersions,
  VersionUnavailableReason,
} from './types/about';
