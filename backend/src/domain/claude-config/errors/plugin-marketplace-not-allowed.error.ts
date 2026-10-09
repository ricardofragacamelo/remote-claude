import { DomainError } from '@domain/shared';

/**
 * A marketplace the allowlist file does not declare (D-15). `403`: the person is who they say, and
 * the machine does not take code from there — only someone with access to its disk can add a source.
 */
export class PluginMarketplaceNotAllowedError extends DomainError {
  readonly code = 'PLUGIN_MARKETPLACE_NOT_ALLOWED';
  readonly messageKey = 'claudeConfig.error.pluginMarketplaceNotAllowed';

  constructor(marketplace: string) {
    super(`marketplace ${marketplace} is not declared in the allowlist file`, { marketplace });
  }
}
