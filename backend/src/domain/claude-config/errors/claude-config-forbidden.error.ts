import { DomainError } from '@domain/shared';

/**
 * A server, a plugin or a folder override that exists and is somebody else's. `403`, the same
 * meaning everywhere in the product; the id is not echoed back.
 */
export class ClaudeConfigForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly messageKey = 'claudeConfig.error.forbidden';

  constructor(what: string) {
    super(`${what} belongs to somebody else`, {});
  }
}
