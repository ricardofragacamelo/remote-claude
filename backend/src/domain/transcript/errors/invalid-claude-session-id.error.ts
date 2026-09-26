import { DomainError } from '@domain/shared';

/** A transcript identifier that is not the UUID the SDK hands out. Caught before the SDK is asked. */
export class InvalidClaudeSessionIdError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'transcript.error.invalidSessionId';

  constructor(raw: string) {
    super(`"${raw}" is not a valid Claude session id`, { sessionId: raw });
  }
}
