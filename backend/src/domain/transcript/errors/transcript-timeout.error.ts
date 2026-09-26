import { DomainError } from '@domain/shared';

/**
 * The Agent SDK did not finish reading the history within the deadline.
 *
 * Every call that leaves the process has an explicit deadline, and a read of the store is one
 * (docs/architecture/shared/04-errors-and-http.md). `504`, because upstream did not answer — which
 * is a different alarm from upstream answering with a failure.
 */
export class TranscriptTimeoutError extends DomainError {
  readonly code = 'CLAUDE_TIMEOUT';
  readonly messageKey = 'transcript.error.claudeTimeout';

  constructor(operation: string, timeoutMs: number) {
    super(`the Agent SDK did not ${operation} within ${String(timeoutMs)} ms`, {
      operation,
      timeoutMs,
    });
  }
}
