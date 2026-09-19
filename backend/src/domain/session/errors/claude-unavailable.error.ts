import { DomainError } from '@domain/shared';

/**
 * The subprocess of the CLI failed or died.
 *
 * `502` and not `500`: it is upstream that fell over, not us. The distinction is what lets an
 * operator tell "our bug" from "the Claude CLI is unhappy on this machine" without reading a
 * stack trace — see docs/architecture/shared/04-errors-and-http.md.
 */
export class ClaudeUnavailableError extends DomainError {
  readonly code = 'CLAUDE_UNAVAILABLE';
  readonly messageKey = 'session.error.claudeUnavailable';

  constructor(sessionId: string) {
    super(`the Claude subprocess of session ${sessionId} ended in failure`, { sessionId });
  }
}
