import { DomainError } from '@domain/shared';

/**
 * The source of a declared marketplace did not answer, or did not have the commit. `502`: a server
 * upstream failed, and nothing was recorded nor left half-downloaded.
 */
export class PluginSourceUnavailableError extends DomainError {
  readonly code = 'PLUGIN_SOURCE_UNAVAILABLE';
  readonly messageKey = 'claudeConfig.error.pluginSourceUnavailable';

  constructor(marketplace: string) {
    super(`the source of marketplace ${marketplace} could not be reached`, { marketplace });
  }
}
