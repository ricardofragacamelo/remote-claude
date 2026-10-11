import { DomainError } from '@domain/shared';

/**
 * A folder override, a server or anything else of the settings of an engine that exists and is
 * somebody else's — or the installation of a user with no root at all. `403`, the same meaning
 * everywhere in the product; the id is not echoed back.
 */
export class AgentSettingsForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly messageKey = 'agentSettings.error.forbidden';

  constructor(what: string) {
    super(`${what} belongs to somebody else`, {});
  }
}
