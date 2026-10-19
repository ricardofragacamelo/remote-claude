import { DomainError } from '@domain/shared';

/**
 * A server that exists and belongs to somebody else (plan 13, B-19, S-76). `403`, same meaning
 * everywhere in the product; nothing about the owner is echoed back.
 */
export class McpServerForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly messageKey = 'mcp.error.forbidden';

  constructor() {
    super('that server belongs to somebody else', {});
  }
}
