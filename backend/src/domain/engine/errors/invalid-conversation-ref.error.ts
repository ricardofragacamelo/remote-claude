import { DomainError } from '@domain/shared';

/**
 * A conversation named by an engine nobody enabled, or by an id that engine never hands out.
 *
 * Caught before the engine is asked: the id of a conversation reaches a subprocess, and an id the
 * engine would not produce is either a typo or a probe.
 */
export class InvalidConversationRefError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'transcript.error.invalidSessionId';

  constructor(engine: string, id: string) {
    super(`"${engine}:${id}" is not a conversation of an enabled engine`, {
      engine,
      sessionId: id,
    });
  }
}
