import { DomainError } from '@domain/shared';

/**
 * A plugin that exists and belongs to somebody else (plan 13, B-27, S-129). `403`, the same meaning
 * {@link import('@domain/mcp').McpServerForbiddenError} already has for a server — nothing about
 * the owner is echoed back.
 */
export class PluginForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly messageKey = 'engines.claude.error.pluginForbidden';

  constructor() {
    super('that plugin belongs to somebody else', {});
  }
}
