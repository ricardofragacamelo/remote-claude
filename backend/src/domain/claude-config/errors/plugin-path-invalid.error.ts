import { DomainError } from '@domain/shared';

/**
 * A directory that is not a plugin — no manifest, a manifest that does not parse — or a marketplace
 * source of a kind we do not fetch, or a path that climbs out of its repository. `422`, with the
 * reason.
 */
export class PluginPathInvalidError extends DomainError {
  readonly code = 'PLUGIN_PATH_INVALID';
  readonly messageKey = 'claudeConfig.error.pluginPathInvalid';

  constructor(reason: string) {
    super(`not a plugin: ${reason}`, { reason });
  }
}
