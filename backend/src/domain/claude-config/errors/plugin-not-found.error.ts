import { DomainError } from '@domain/shared';

/**
 * A plugin of the store that does not exist. `404`; somebody else's is `FORBIDDEN`.
 */
export class PluginNotFoundError extends DomainError {
  readonly code = 'PLUGIN_NOT_FOUND';
  readonly messageKey = 'claudeConfig.error.pluginNotFound';

  constructor(pluginId: string) {
    super(`plugin ${pluginId} does not exist`, { pluginId });
  }
}
