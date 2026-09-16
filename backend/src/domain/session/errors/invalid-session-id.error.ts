import { DomainError } from '@domain/shared';

/** A session identifier that is not a ULID. Caught before anything reaches the repository. */
export class InvalidSessionIdError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'session.error.invalidSessionId';

  constructor(raw: string) {
    super(`"${raw}" is not a valid session id`, { sessionId: raw });
  }
}
