import { DomainError } from '@domain/shared';

/**
 * The CLI of a live session did not answer a control request within the deadline.
 *
 * Every call that leaves the process has an explicit deadline
 * (docs/architecture/shared/04-errors-and-http.md). `504`, because upstream did not answer — a
 * different alarm from upstream answering with a failure, which is `CLAUDE_UNAVAILABLE`.
 */
export class ClaudeTimeoutError extends DomainError {
  readonly code = 'CLAUDE_TIMEOUT';
  readonly messageKey = 'session.error.claudeTimeout';

  constructor(sessionId: string, operation: string, timeoutMs: number) {
    super(`session ${sessionId} did not ${operation} within ${String(timeoutMs)} ms`, {
      operation,
      timeoutMs,
    });
  }
}
