import { DomainError } from '@domain/shared';

/**
 * The key file the secrets of MCP servers are encrypted with is missing or unusable — the discipline
 * of the push credential (plan 02, D-20). A server **with** a secret is not stored; everything else
 * works. `503`, because the cause is the machine and not the request.
 */
export class SecretStoreUnavailableError extends DomainError {
  readonly code = 'SERVICE_UNAVAILABLE';
  readonly messageKey = 'claudeConfig.error.secretStoreUnavailable';

  constructor() {
    super(`the key file of the MCP secrets is missing or unreadable`);
  }
}
